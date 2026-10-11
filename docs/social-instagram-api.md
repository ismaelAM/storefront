# Instagram daily offers API contract

Evidence checked on 2026-10-11. This integration uses **Instagram API with
Instagram Login**, for a professional Business or Creator account. Meta's own
Postman collection confirms that this login path does not require a linked
Facebook Page, uses `graph.instagram.com`, and names the current scopes
`instagram_business_basic` and `instagram_business_content_publish`.
The older `business_basic` / `business_content_publish` names were deprecated
on 2025-01-27. Facebook Login is a different setup with different Page and token
requirements; do not mix its credentials or scopes into this client.

Primary sources:

- [Meta's Instagram API collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00): Instagram Login professional accounts, no linked Page requirement, replacement scope names, versioned `graph.instagram.com` URLs and bearer authorization.
- [Meta's current Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df): current permission names and Instagram host.
- [Meta's container status request](https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status): `status_code=FINISHED` is the ready condition. This example uses Facebook Login, so its host/token are not used in this implementation.
- [Meta's Instagram Login content publishing guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing).
- [Meta's media creation reference](https://developers.facebook.com/docs/instagram-api/reference/ig-user/media).
- [Meta's container reference](https://developers.facebook.com/docs/instagram-api/reference/ig-container).
- [Meta's version changelog](https://developers.facebook.com/docs/graph-api/changelog).

The Meta documentation and changelog endpoints were unavailable to the research
reader (inaccessible responses and HTTP429). Meta's Postman content was available
through search indexing, while its direct documentation reader returned a UI
shell. Consequently no latest API version or live carousel capability is claimed
as verified in this session. `INSTAGRAM_API_VERSION` is required explicitly;
there is no guessed default. The version, image requirements and carousel
endpoints must be checked for the configured Meta app before enabling real
publishing. Mock tests verify the request contract and failure boundaries, not
account permissions or successful publication to Instagram.

## Server configuration

`readInstagramConfig()` requires all of these server variables:

| Variable | Meaning |
| --- | --- |
| `INSTAGRAM_ACCOUNT_ID` | Numeric ID of the target professional Instagram account |
| `INSTAGRAM_ACCESS_TOKEN` | Access token granted through Instagram Login, with publishing permission |
| `INSTAGRAM_API_VERSION` | Explicit supported Graph version such as `vNN.0`, verified for the app |

Missing, malformed or redacted placeholder configuration returns
`{ configured: false }`. Never expose any of these values through `NEXT_PUBLIC_`
variables, client components, public job responses, database checkpoints or logs.
The publisher imports `server-only`, uses an Authorization bearer header, and
never includes credentials in URLs or retained errors. Redirects are rejected
to prevent forwarding the bearer token to another destination.

## Request sequence

The deterministic renderer supplies exactly four publicly accessible HTTPS JPEG
URLs, one per category (three real offers each), and a caption of at most 2200
Unicode code points. The client does not generate media or fetch product data.
The image endpoint must serve the rendered JPEG without cookies, authentication
or an expiring URL. URL validation does not substitute for JPEG content and
dimension validation in the renderer.

1. `POST /{account-id}/media` for each image with `image_url` and
   `is_carousel_item=true`; retain the returned numeric container ID.
2. Poll `GET /{child-container-id}?fields=status_code` until `FINISHED`.
3. `POST /{account-id}/media` with `media_type=CAROUSEL`, comma separated
   `children` IDs in category order, and `caption`; retain the parent ID.
4. Poll the parent container until `FINISHED`.
5. Durably mark the job as having attempted publication, then send exactly one
   `POST /{account-id}/media_publish` with `creation_id={parent-id}`.
6. Durably retain the returned published media ID.

Every URL has the configured version prefix. Requests time out after15 seconds
by default. Polling is bounded to five status requests per container with one
minute between requests. Callers may inject shorter bounded polling to fit
their execution budget and resume from the retained containers on a later run.
`ERROR`, `EXPIRED`, unknown statuses and exhausted polls stop publication.

## Durable caller obligations

`publishInstagramCarousel(config, input, options)` requires two asynchronous
callbacks and optionally takes a previous checkpoint:

- `onCheckpoint(checkpoint)` must persist the state before resolving. It runs
  for initial state, every newly created container and the successful media ID.
- `beforePublish(checkpoint)` must atomically verify the job's active owner and
  persist `publishAttempted=true` before resolving. The client invokes it before
  the irreversible publish request; a callback rejection prevents that request.
- `checkpoint` includes `inputHash`, `childContainerIds`, an optional
  `carouselContainerId`, `publishAttempted` and `publishedMediaId`.

The input hash binds the checkpoint to the account, ordered image URLs and exact
caption. A mismatch stops the operation. The caller must also freeze the offer
manifest and image contents for that job, use a unique date/job key, prevent
overlapping owners and preserve uncertain outcomes across deployments. The
client cannot supply those persistence and exclusion guarantees itself.

When a stored media ID exists, resuming returns it without contacting Meta.
When `publishAttempted=true` exists without a stored media ID, resuming throws
`InstagramPublishUncertainError` without contacting Meta. A timeout, HTTP error,
malformed publish response or failure saving a successful publication is treated
as uncertain. **Never automatically clear that marker or resend publication.**
Reconcile the container/account manually before authorizing another attempt.
If the publish returned a media ID before persistence failed, the uncertain
error includes `publishedMediaId` for durable recovery.

Container creation failures are safe with respect to public duplicate posts,
although Meta may have accepted an unpublished container before a response was
lost. Reuse saved containers on safe retries. Expired/failed containers require
an explicit safe reset before publication has ever been attempted. No automatic
retry exists inside the client for any mutation.
