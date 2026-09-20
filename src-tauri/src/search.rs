use regex::Regex;
use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::IpAddr;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use url::{Host, Url};

const MAX_RESPONSE_BYTES: usize = 5_000_000;
static TAGS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]*>").unwrap());

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(status: u16, code: &'static str, message: impl Into<String>) -> Self {
        Self { status, code, message: message.into() }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchRequest {
    pub q: String,
    pub category: String,
    pub page: u8,
    pub safe: String,
    pub language: String,
    pub time: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub thumbnail: String,
    pub published: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub elapsed: f64,
    pub has_more: bool,
    pub partial: bool,
}

#[derive(Debug, Serialize)]
pub struct ConnectionStatus {
    pub configured: bool,
    pub connected: bool,
}

pub fn client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .https_only(true)
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(18))
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(4)
        .user_agent("Sreon/0.2")
        .build()
}

fn blocked_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(host)) => {
            let host = host.trim_end_matches('.').to_ascii_lowercase();
            host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local")
        }
        Some(Host::Ipv4(ip)) => blocked_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => blocked_ip(IpAddr::V6(ip)),
        None => true,
    }
}

fn blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast(),
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() {
                return blocked_ip(IpAddr::V4(ip));
            }
            ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() || ip.segments()[0] & 0xfe00 == 0xfc00 || ip.segments()[0] & 0xffc0 == 0xfe80
        }
    }
}

pub fn endpoint_url(raw: &str) -> Result<Url, ApiError> {
    if raw.trim().is_empty() {
        return Err(ApiError::new(503, "NOT_CONFIGURED", "Add your hosted HTTPS search service in Search settings. The Mac app does not need a localhost server or Docker."));
    }
    let invalid = || ApiError::new(400, "INVALID_ENDPOINT", "Use an HTTPS search-service base URL without credentials, query parameters, or a local network address.");
    let mut url = Url::parse(raw.trim()).map_err(|_| invalid())?;
    if raw.len() > 2048 || url.scheme() != "https" || blocked_host(&url) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err(invalid());
    }
    if !url.path().ends_with('/') {
        url.set_path(&format!("{}/", url.path()));
    }
    Ok(url)
}

pub fn web_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    if raw.len() > 8192 || !["https", "http"].contains(&url.scheme()) || blocked_host(&url) || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    Some(url)
}

pub fn request_url(endpoint: &str, request: &SearchRequest) -> Result<Url, ApiError> {
    let q = request.q.trim();
    if q.is_empty() || q.chars().count() > 500 || !(1..=20).contains(&request.page)
        || !["general", "images", "news", "videos"].contains(&request.category.as_str())
        || !["0", "1", "2"].contains(&request.safe.as_str())
        || !["auto", "en", "de", "es", "fr", "it", "ja"].contains(&request.language.as_str())
        || !["", "day", "week", "month", "year"].contains(&request.time.as_str()) {
        return Err(ApiError::new(400, "INVALID_QUERY", "Enter a search of 1–500 characters and select valid filters."));
    }
    let mut url = endpoint_url(endpoint)?.join("search").map_err(|_| ApiError::new(400, "INVALID_ENDPOINT", "Invalid search-service URL."))?;
    url.query_pairs_mut()
        .append_pair("q", q)
        .append_pair("categories", &request.category)
        .append_pair("pageno", &request.page.to_string())
        .append_pair("safesearch", &request.safe)
        .append_pair("language", &request.language)
        .append_pair("time_range", &request.time)
        .append_pair("format", "json");
    Ok(url)
}

fn text(value: Option<&Value>) -> String {
    let raw = value.and_then(Value::as_str).unwrap_or_default();
    let stripped = TAGS.replace_all(raw, "");
    html_escape::decode_html_entities(&stripped).trim().chars().take(5000).collect()
}

pub fn normalize(data: Value, page: u8, elapsed: Duration) -> Result<SearchResponse, ApiError> {
    let raw = data.get("results").and_then(Value::as_array).ok_or_else(|| ApiError::new(502, "INVALID_RESPONSE", "The search service returned an unsupported response. Make sure JSON search is enabled."))?;
    let results: Vec<SearchResult> = raw.iter().take(60).filter_map(|item| {
        let url = web_url(item.get("url")?.as_str()?)?;
        let mut title = text(item.get("title"));
        if title.is_empty() { title = url.host_str().unwrap_or("Website").to_string(); }
        let thumbnail = ["thumbnail_src", "img_src", "thumbnail"].iter()
            .filter_map(|key| item.get(key).and_then(Value::as_str).and_then(web_url))
            .next().map(|url| url.to_string()).unwrap_or_default();
        Some(SearchResult {
            title,
            url: url.to_string(),
            content: text(item.get("content")),
            thumbnail,
            published: text(item.get("publishedDate").or_else(|| item.get("published_date"))),
        })
    }).collect();
    let has_more = !results.is_empty() && page < 20 && data.get("paging").and_then(Value::as_bool) != Some(false);
    let partial = data.get("unresponsive_engines").and_then(Value::as_array).is_some_and(|engines| !engines.is_empty());
    Ok(SearchResponse { results, elapsed: elapsed.as_secs_f64(), has_more, partial })
}

pub async fn perform(client: Client, endpoint: String, request: SearchRequest) -> Result<SearchResponse, ApiError> {
    let url = request_url(&endpoint, &request)?;
    let start = Instant::now();
    let mut response = client.get(url).header("Accept", "application/json").send().await.map_err(network_error)?;
    if !response.status().is_success() {
        return Err(ApiError::new(502, "BACKEND_ERROR", if response.status().as_u16() == 403 {
            "The search service refused this request. Enable JSON search on your hosted backend."
        } else { "The search service is unavailable. Please try again shortly." }));
    }
    if response.content_length().is_some_and(|length| length > MAX_RESPONSE_BYTES as u64) {
        return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search service returned too much data."));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search service returned too much data."));
        }
        bytes.extend_from_slice(&chunk);
    }
    let data = serde_json::from_slice(&bytes).map_err(|_| ApiError::new(502, "INVALID_RESPONSE", "The search service did not return JSON. Check the service address and its JSON-search setting."))?;
    normalize(data, request.page, start.elapsed())
}

pub async fn connection(client: &Client, endpoint: &str) -> ConnectionStatus {
    let Ok(base) = endpoint_url(endpoint) else { return ConnectionStatus { configured: false, connected: false }; };
    let connected = match base.join("healthz") {
        Ok(url) => client.get(url).timeout(Duration::from_secs(5)).send().await.is_ok_and(|response| response.status().is_success()),
        Err(_) => false,
    };
    ConnectionStatus { configured: true, connected }
}

fn network_error(error: reqwest::Error) -> ApiError {
    if error.is_timeout() {
        ApiError::new(504, "TIMEOUT", "The search service took too long. Try again in a moment.")
    } else {
        ApiError::new(502, "BACKEND_UNAVAILABLE", "Could not connect securely to your search service. Check the address and your internet connection.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request() -> SearchRequest {
        SearchRequest { q: "forest & trees".into(), category: "images".into(), page: 2, safe: "2".into(), language: "en".into(), time: "week".into() }
    }

    #[test]
    fn only_hosted_https_endpoints_are_accepted() {
        for url in ["http://example.com", "file:///etc/passwd", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.1", "https://user:secret@example.com", "https://example.com/?key=secret", "https://machine.local", "https://[::ffff:127.0.0.1]"] {
            assert!(endpoint_url(url).is_err(), "{url}");
        }
        assert_eq!(endpoint_url("https://example.com/private").unwrap().as_str(), "https://example.com/private/");
        assert_eq!(endpoint_url("").unwrap_err().code, "NOT_CONFIGURED");
    }

    #[test]
    fn query_and_filters_are_encoded_without_overwriting_the_host() {
        let url = request_url("https://example.com/engine", &request()).unwrap();
        assert_eq!(url.path(), "/engine/search");
        let params: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(params["q"], "forest & trees");
        assert_eq!(params["pageno"], "2");
        assert_eq!(params["categories"], "images");
        assert_eq!(params["safesearch"], "2");
        assert_eq!(params["time_range"], "week");
        assert_eq!(params["format"], "json");
    }

    #[test]
    fn invalid_searches_are_rejected() {
        let mut input = request();
        input.q = " ".into();
        assert!(request_url("https://example.com", &input).is_err());
        input.q = "x".repeat(501);
        assert!(request_url("https://example.com", &input).is_err());
        input = request();
        input.page = 0;
        assert!(request_url("https://example.com", &input).is_err());
        input = request();
        input.category = "unknown".into();
        assert!(request_url("https://example.com", &input).is_err());
    }

    #[test]
    fn results_are_normalized_and_unsafe_urls_are_removed() {
        let data = json!({"results": [
            {"title":"<b>Forests</b> &amp; trees", "url":"https://example.com/a", "content":"A <em>living</em> world", "img_src":"https://example.com/a.jpg"},
            {"title":"Bad", "url":"javascript:alert(1)"},
            {"title":"Private", "url":"http://127.0.0.1/private"}
        ], "unresponsive_engines":[["source", "timeout"]]});
        let response = normalize(data, 1, Duration::from_millis(80)).unwrap();
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].title, "Forests & trees");
        assert_eq!(response.results[0].content, "A living world");
        assert!(response.partial);
        assert!(response.has_more);
        assert_eq!(response.elapsed, 0.08);
    }

    #[test]
    fn empty_results_and_invalid_payloads_remain_distinct() {
        let empty = normalize(json!({"results":[]}), 1, Duration::ZERO).unwrap();
        assert!(!empty.has_more);
        assert!(normalize(json!({"not_results":[]}), 1, Duration::ZERO).is_err());
    }

    #[test]
    fn response_fields_are_bounded() {
        let result = json!({"title":"t".repeat(9000), "url":"https://example.com/"});
        let response = normalize(json!({"results":vec![result; 100]}), 20, Duration::ZERO).unwrap();
        assert_eq!(response.results.len(), 60);
        assert_eq!(response.results[0].title.len(), 5000);
        assert!(!response.has_more);
    }
}
