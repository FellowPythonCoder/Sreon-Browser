use reqwest::{redirect::Policy, Client, Response};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::net::IpAddr;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use url::{Host, Url};

const WEB_SOURCE: &str = "https://html.duckduckgo.com/html/";
const REFERENCE_SOURCE: &str = "https://en.wikipedia.org/w/api.php";
const MAX_BYTES: usize = 3_000_000;
const CURSOR_FIELDS: &[&str] = &["s", "dc", "v", "o", "api", "vqd", "nextParams", "kl"];
static RESULTS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("#links .web-result, .result.web-result").unwrap());
static TITLE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("a.result__a, h2 a").unwrap());
static SNIPPET: LazyLock<Selector> = LazyLock::new(|| Selector::parse(".result__snippet").unwrap());
static FORMS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("form").unwrap());
static INPUTS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("input[name]").unwrap());
static NEXT: LazyLock<Selector> = LazyLock::new(|| Selector::parse("input[type=submit], button").unwrap());
static EMPTY: LazyLock<Selector> = LazyLock::new(|| Selector::parse(".no-results, .no-results__message").unwrap());
static CHALLENGE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("#challenge-form, .anomaly-modal, #anomaly-modal").unwrap());

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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "source", rename_all = "snake_case", deny_unknown_fields)]
pub enum SearchCursor {
    Web { fields: BTreeMap<String, String> },
    Reference { offset: usize },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchRequest {
    pub q: String,
    #[serde(default)]
    pub cursor: Option<SearchCursor>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub elapsed: f64,
    pub next_cursor: Option<SearchCursor>,
    pub notice: Option<String>,
}

pub fn client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .https_only(true)
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(9))
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(2)
        .user_agent("Sreon/0.3.0 (https://github.com/FellowPythonCoder/Sreon-Browser)")
        .build()
}

fn blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast(),
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() { return blocked_ip(IpAddr::V4(ip)); }
            ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() || ip.segments()[0] & 0xfe00 == 0xfc00 || ip.segments()[0] & 0xffc0 == 0xfe80
        }
    }
}

pub fn web_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    let blocked = match url.host() {
        Some(Host::Domain(host)) => {
            let host = host.trim_end_matches('.').to_ascii_lowercase();
            host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local")
        }
        Some(Host::Ipv4(ip)) => blocked_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => blocked_ip(IpAddr::V6(ip)),
        None => true,
    };
    if raw.len() > 8192 || !["https", "http"].contains(&url.scheme()) || blocked || !url.username().is_empty() || url.password().is_some() { return None; }
    Some(url)
}

pub fn validate(request: &SearchRequest) -> Result<(), ApiError> {
    let invalid = || ApiError::new(400, "INVALID_QUERY", "Enter a search of 1–500 characters and try again.");
    if request.q.trim().is_empty() || request.q.chars().count() > 500 { return Err(invalid()); }
    if let Some(cursor) = &request.cursor {
        match cursor {
            SearchCursor::Web { fields } => {
                if fields.len() > CURSOR_FIELDS.len() || !fields.contains_key("s") || !fields.contains_key("vqd") { return Err(invalid()); }
                for (name, value) in fields {
                    if !CURSOR_FIELDS.contains(&name.as_str()) || value.len() > 2048 { return Err(invalid()); }
                }
                if !fields.get("s").and_then(|value| value.parse::<usize>().ok()).is_some_and(|value| (1..=500).contains(&value)) { return Err(invalid()); }
            }
            SearchCursor::Reference { offset } => if !(1..=500).contains(offset) { return Err(invalid()); },
        }
    }
    Ok(())
}

fn plain_text(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(3000).collect()
}

fn clean_text(raw: &str) -> String {
    let fragment = Html::parse_fragment(raw);
    plain_text(&fragment.root_element().text().collect::<Vec<_>>().join(" "))
}

fn result_url(raw: &str) -> Option<Url> {
    let mut url = if raw.starts_with('/') {
        Url::parse(WEB_SOURCE).ok()?.join(raw).ok()?
    } else { Url::parse(raw).ok()? };
    let host = url.host_str()?;
    if host == "duckduckgo.com" || host.ends_with(".duckduckgo.com") {
        if url.path().ends_with("y.js") { return None; }
        if url.path().starts_with("/l/") {
            let target = url.query_pairs().find(|(key, _)| key == "uddg")?.1.into_owned();
            url = Url::parse(&target).ok()?;
        }
    }
    let mut safe = web_url(url.as_str())?;
    safe.set_fragment(None);
    Some(safe)
}

pub fn parse_web(html: &str) -> Result<SearchResponse, ApiError> {
    let unavailable = || ApiError::new(502, "SOURCE_UNAVAILABLE", "Web search is temporarily unavailable. Please try again in a moment.");
    let document = Html::parse_document(html);
    if document.select(&CHALLENGE).next().is_some() { return Err(unavailable()); }
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for item in document.select(&RESULTS).take(60) {
        if item.value().classes().any(|class| class.starts_with("result--ad")) { continue; }
        let Some(link) = item.select(&TITLE).next() else { continue; };
        let Some(url) = link.value().attr("href").and_then(result_url) else { continue; };
        let title = plain_text(&link.text().collect::<Vec<_>>().join(" "));
        if title.is_empty() || !seen.insert(url.to_string()) { continue; }
        let content = item.select(&SNIPPET).next().map(|snippet| plain_text(&snippet.text().collect::<Vec<_>>().join(" "))).unwrap_or_default();
        results.push(SearchResult { title, url: url.to_string(), content });
    }
    if results.is_empty() && document.select(&EMPTY).next().is_none() { return Err(unavailable()); }
    let mut next_cursor = None;
    if !results.is_empty() {
        for form in document.select(&FORMS) {
            let is_next = form.select(&NEXT).any(|control| {
                control.value().attr("value").unwrap_or("").eq_ignore_ascii_case("next") || control.text().collect::<String>().trim().eq_ignore_ascii_case("next")
            });
            if !is_next { continue; }
            let fields: BTreeMap<String, String> = form.select(&INPUTS).filter_map(|input| {
                let name = input.value().attr("name")?;
                if !CURSOR_FIELDS.contains(&name) { return None; }
                Some((name.to_owned(), input.value().attr("value").unwrap_or("").to_owned()))
            }).collect();
            let cursor = SearchCursor::Web { fields };
            if validate(&SearchRequest { q: "pagination".into(), cursor: Some(cursor.clone()) }).is_ok() { next_cursor = Some(cursor); }
            break;
        }
    }
    Ok(SearchResponse { results, elapsed: 0.0, next_cursor, notice: None })
}

fn web_form(request: &SearchRequest) -> Vec<(String, String)> {
    let mut fields = match &request.cursor {
        Some(SearchCursor::Web { fields }) => fields.clone(),
        _ => BTreeMap::from([("b".to_string(), String::new())]),
    };
    fields.insert("q".into(), request.q.trim().into());
    fields.into_iter().collect()
}

async fn read_body(mut response: Response) -> Result<Vec<u8>, ApiError> {
    if !response.status().is_success() { return Err(ApiError::new(502, "SOURCE_UNAVAILABLE", "Search is temporarily unavailable. Please try again.")); }
    if response.content_length().is_some_and(|length| length > MAX_BYTES as u64) { return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search response was too large.")); }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if data.len() + chunk.len() > MAX_BYTES { return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search response was too large.")); }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}

async fn search_web(client: &Client, request: &SearchRequest) -> Result<SearchResponse, ApiError> {
    let response = client.post(WEB_SOURCE).header("Accept", "text/html").form(&web_form(request)).send().await.map_err(network_error)?;
    let bytes = read_body(response).await?;
    parse_web(&String::from_utf8_lossy(&bytes))
}

pub fn parse_reference(data: Value) -> Result<SearchResponse, ApiError> {
    let entries = data.get("query").and_then(|query| query.get("search")).and_then(Value::as_array).ok_or_else(|| ApiError::new(502, "SOURCE_UNAVAILABLE", "Search isn't responding right now. Please try again."))?;
    let mut seen = HashSet::new();
    let results = entries.iter().take(20).filter_map(|item| {
        let id = item.get("pageid")?.as_u64()?;
        let title = plain_text(item.get("title")?.as_str()?);
        if id == 0 || title.is_empty() || !seen.insert(id) { return None; }
        Some(SearchResult { title, url: format!("https://en.wikipedia.org/?curid={id}"), content: clean_text(item.get("snippet").and_then(Value::as_str).unwrap_or_default()) })
    }).collect::<Vec<_>>();
    let next_cursor = data.get("continue").and_then(|value| value.get("sroffset")).and_then(Value::as_u64).filter(|offset| (1..=500).contains(offset)).filter(|_| !results.is_empty()).map(|offset| SearchCursor::Reference { offset: offset as usize });
    Ok(SearchResponse { results, elapsed: 0.0, next_cursor, notice: Some("Web results are temporarily unavailable. Showing reference articles instead.".into()) })
}

async fn search_reference(client: &Client, request: &SearchRequest) -> Result<SearchResponse, ApiError> {
    let offset = match &request.cursor { Some(SearchCursor::Reference { offset }) => *offset, _ => 0 };
    let response = client.get(REFERENCE_SOURCE).query(&[
        ("action", "query"), ("list", "search"), ("format", "json"), ("srsearch", request.q.trim()), ("srlimit", "10"), ("sroffset", &offset.to_string())
    ]).send().await.map_err(network_error)?;
    let bytes = read_body(response).await?;
    let data = serde_json::from_slice(&bytes).map_err(|_| ApiError::new(502, "SOURCE_UNAVAILABLE", "Search isn't responding right now. Please try again."))?;
    parse_reference(data)
}

pub async fn perform(client: Client, request: SearchRequest) -> Result<SearchResponse, ApiError> {
    validate(&request)?;
    let started = Instant::now();
    let mut result = match &request.cursor {
        Some(SearchCursor::Reference { .. }) => search_reference(&client, &request).await?,
        _ => match search_web(&client, &request).await {
            Ok(result) => result,
            Err(_) if request.cursor.is_none() => search_reference(&client, &request).await?,
            Err(error) => return Err(error),
        },
    };
    result.elapsed = started.elapsed().as_secs_f64();
    Ok(result)
}

fn network_error(_: reqwest::Error) -> ApiError {
    ApiError::new(502, "SEARCH_UNAVAILABLE", "Search couldn't connect. Check your internet connection and try again.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn result(url: &str, title: &str) -> String {
        format!(r#"<div class="web-result result"><h2><a class="result__a" href="{url}">{title}</a></h2><a class="result__snippet">A <b>real</b> page.</a></div>"#)
    }

    #[test]
    fn search_requires_only_a_query() {
        let input: SearchRequest = serde_json::from_value(json!({"q":"hello"})).unwrap();
        assert!(validate(&input).is_ok());
        assert!(serde_json::from_value::<SearchRequest>(json!({"q":"hello", "endpoint":"https://example.com"})).is_err());
        assert_eq!(web_form(&input).into_iter().collect::<BTreeMap<_,_>>()["q"], "hello");
    }

    #[test]
    fn unsafe_urls_are_rejected() {
        for url in ["file:///etc/passwd", "javascript:alert(1)", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.1", "https://user:secret@example.com", "https://device.local", "https://[::ffff:127.0.0.1]"] { assert!(web_url(url).is_none(), "{url}"); }
        assert!(web_url("https://example.org/path").is_some());
    }

    #[test]
    fn extracts_real_results_and_removes_duplicates_and_ads() {
        let html = format!("{}{}{}{}", result("https://example.org/", "Hello &amp; world"), result("https://example.org/#fragment", "Duplicate"), result("javascript:alert(1)", "Bad"), result("https://ad.example.org", "Advertisement").replace("web-result result", "web-result result result--ad"));
        let response = parse_web(&html).unwrap();
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].title, "Hello & world");
        assert_eq!(response.results[0].content, "A real page.");
    }

    #[test]
    fn unwraps_provider_redirects_to_original_destinations() {
        let url = result_url("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fhello%3Fa%3D1&rut=tracking").unwrap();
        assert_eq!(url.as_str(), "https://example.org/hello?a=1");
        assert!(result_url("https://duckduckgo.com/y.js?ad_provider=test").is_none());
        assert!(result_url("/l/?uddg=javascript%3Aalert(1)").is_none());
    }

    #[test]
    fn captcha_and_changed_markup_are_errors_not_fake_empty_results() {
        assert!(parse_web(r#"<form id="challenge-form">Challenge</form>"#).is_err());
        assert!(parse_web("<h1>Sign in</h1>").is_err());
        assert!(parse_web(r#"<div class="no-results">No results found</div>"#).unwrap().results.is_empty());
    }

    #[test]
    fn pagination_uses_bounded_form_fields_never_arbitrary_hosts() {
        let html = format!(r#"{}<form action="https://untrusted.example/"><input name="s" value="10"><input name="vqd" value="test-token"><input name="endpoint" value="https://bad.example"><input type="submit" value="Next"></form>"#, result("https://example.org", "Result"));
        let cursor = parse_web(&html).unwrap().next_cursor.unwrap();
        let SearchCursor::Web { fields } = &cursor else { panic!("Expected web cursor") };
        assert!(!fields.contains_key("endpoint"));
        let request = SearchRequest { q: "query".into(), cursor: Some(cursor) };
        assert!(validate(&request).is_ok());
        assert_eq!(web_form(&request).into_iter().collect::<BTreeMap<_,_>>()["q"], "query");
    }

    #[test]
    fn malformed_or_oversized_requests_are_rejected() {
        for query in [String::new(), " ".into(), "x".repeat(501)] { assert!(validate(&SearchRequest { q: query, cursor: None }).is_err()); }
        assert!(validate(&SearchRequest { q:"ok".into(), cursor:Some(SearchCursor::Reference { offset: 501 }) }).is_err());
        assert!(validate(&SearchRequest { q:"ok".into(), cursor:Some(SearchCursor::Web { fields:BTreeMap::from([("url".into(), "https://bad.example".into())]) }) }).is_err());
    }

    #[test]
    fn reference_fallback_is_live_data_and_explicitly_labeled() {
        let data = json!({"query":{"search":[{"pageid":42,"title":"Forests","snippet":"A <span>living</span> world"}]},"continue":{"sroffset":10}});
        let response = parse_reference(data).unwrap();
        assert_eq!(response.results[0].url, "https://en.wikipedia.org/?curid=42");
        assert_eq!(response.results[0].content, "A living world");
        assert!(response.notice.is_some());
        assert!(matches!(response.next_cursor, Some(SearchCursor::Reference { offset: 10 })));
        assert!(parse_reference(json!({"error":"rate limited"})).is_err());
    }
}
