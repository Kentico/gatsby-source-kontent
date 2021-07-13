/**
 * Configure your Gatsby site with this file.
 *
 * See: https://www.gatsbyjs.org/docs/gatsby-config/
 */

require("dotenv").config({ path: ".env.development" })

module.exports = {
  plugins: [
    {
      resolve: "@kentico/gatsby-source-kontent",
      options: {
        projectId: process.env.KONTENT_PROJECT_ID,
        languageCodenames: process.env.KONTENT_LANGUAGE_CODENAMES.split(
          ","
        ).map(lang => lang.trim()),
        usePreviewUrl: !!process.env.KONTENT_PREVIEW_ENABLED,
        authorizationKey: process.env.KONTENT_PREVIEW_ENABLED
          ? process.env.KONTENT_PREVIEW_KEY
          : undefined, // secured API is not expected
        // includeRawContent: true,
        includeTaxonomies: true,
        includeTypes: true,
        proxy: {
          deliveryDomain: process.env.KONTENT_DELIVERY_DOMAIN || undefined,
          previewDeliveryDomain:
            process.env.KONTENT_PREVIEW_DELIVERY_DOMAIN || undefined,
        },
        experimental: {
          managementApiTriggersUpdate: true
        }
      },
    },
    "gatsby-plugin-image",
  ],
}
