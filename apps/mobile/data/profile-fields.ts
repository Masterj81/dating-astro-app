// Profile MVP catalog + sanitizers — moved to @astro/shared/profile so the
// web app can consume the same source of truth. This file is kept as a
// re-export so existing mobile imports (`from '../../data/profile-fields'`)
// continue to resolve without churn.
//
// New code should prefer importing from '@astro/shared/profile' directly.

export * from '@astro/shared/profile';
