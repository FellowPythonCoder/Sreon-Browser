# Deploying Sreon to Render

This repository includes a Render Blueprint (`render.yaml`) for the Docker web service. It runs the website and search API together and attaches `opensreon.com` to that service.

## First-time setup

1. Merge the pull request containing `render.yaml` into `main`.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**, connect `FellowPythonCoder/Sreon-Browser`, and select `main`.
3. Review and apply the Blueprint. Render builds `site/Dockerfile`, deploys the web service in Ohio, and configures `opensreon.com`. The service uses the free plan; free web services can spin down after inactivity.
4. Open the created service’s **Settings → Custom Domains** and follow Render’s domain verification instructions. Use the exact `*.onrender.com` hostname shown for the service in the DNS records below.
5. At the DNS provider for `opensreon.com`, remove conflicting records pointing the apex (`@`) or `www` at the previous host, then add:
   - Apex (`@`): an `ALIAS`/`ANAME` to the Render hostname if supported, otherwise an `A` record to `216.24.57.1`.
   - `www`: a `CNAME` to the Render hostname.
   - Remove stale `AAAA` records for these names; Render does not currently support IPv6 for custom domains.
6. Wait for DNS propagation and for Render to issue the managed TLS certificate. Verify `https://opensreon.com` and `https://www.opensreon.com`.

A free web service may sleep when idle and take a short time to wake on the next request. Choose a paid always-on instance in Render if the site must never sleep. No Render account or DNS changes are performed automatically by this repository configuration.
