
const pluginOptionsSchema = ({ Joi }: { Joi: any }) => {
  return Joi.object({
    projectId: Joi.string()
      .required()
      .length(36)
      .description(`Project ID from "Project settings" -> "API keys".`),
    languageCodenames: Joi.array().items(Joi.string())
      .required()
      .min(1)
      .description(`Array of language codenames from "Project settings" -> "Localization" - the first one is considered as the default one.`),
    includeTypes: Joi.boolean()
      .description(`Include content type nodes to GraphQL model.`)
      .default(false),
    includeTaxonomies: Joi.boolean()
      .description(`Include taxonomy node to GraphQL model.`)
      .default(false),
    authorizationKey: Joi.string()
      .description(`For preview/secured API key - depends on "usePreviewUrl" config.`),
    usePreviewUrl: Joi.boolean()
      .description(`When true, "preview-deliver.kontent.ai" used as primary domain for data source.`)
      .default(false),
    proxy: Joi.object()
      .keys({
        deliveryDomain: Joi.string()
          .description(`Base url used for all requests. Defaults to "deliver.kontent.ai".`),
        previewDeliveryDomain: Joi.string()
          .description(`Base url used for preview requests. Defaults to "preview-deliver.kontent.ai".`)
      })
      .description(`Proxy domain setting object`),
    includeRawContent: Joi.boolean()
      .description("Include `internal.content` property as a part fo the GraphQL model.")
      .default(false),
    experimental: Joi.object()
    .keys({
      managementApiTriggersUpdate: Joi.boolean()
      .description("Turn on experimental handling of management API triggers for update.")
      .default(false),
    })
  });
}

export {
  pluginOptionsSchema
}