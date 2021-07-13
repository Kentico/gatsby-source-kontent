// This is an example using Jest (https://jestjs.io/)
import { testPluginOptionsSchema } from "gatsby-plugin-utils"
import {  } from "../gatsby-node";
import { pluginOptionsSchema } from "../src/pluginOptionsSchema";

describe(`pluginOptionsSchema`, () => {
  it(`should invalidate incorrect options`, async () => {
    const options = {
      projectId: "invalid-guid-format",
      usePreviewUrl: "yes",
    };

    const { isValid, errors } = await testPluginOptionsSchema(
      pluginOptionsSchema,
      options
    )

    expect(isValid).toBe(false)
    expect(errors).toEqual([
      '"projectId" length must be 36 characters long',
      '"languageCodenames" is required',
      '"usePreviewUrl" must be a boolean'
    ]);
  })

  it(`should validate correct options`, async () => {
    const options = {
      projectId: "00676a8d-358c-0084-f2f2-33ed466c480a",
      languageCodenames: [
        "en-US"
      ],
      usePreviewUrl: true,
      authorizationKey: "dummy authorization key",
      includeRawContent: true,
      includeTaxonomies: true,
      includeTypes: true,
      proxy: {
        deliveryDomain: "deliver.example.com",
        previewDeliveryDomain: "preview-deliver.example.com"
      },
      experimental: {
        managementApiTriggersUpdate: true
      }
    };

    const { isValid, errors } = await testPluginOptionsSchema(
      pluginOptionsSchema,
      options
    )

    expect(isValid).toBe(true)
    expect(errors).toEqual([])
  })
})