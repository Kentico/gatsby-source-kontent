import { SourceNodesArgs, Node } from "gatsby"
import { CustomPluginOptions, KontentItem, KontentItemInput } from "./types"

import * as client from "./client";
import { addPreferredLanguageProperty, alterRichTextElements, getKontentItemLanguageVariantArtifact } from "./sourceNodes.items";
import { getKontentItemNodeStringForId, getKontentTaxonomyTypeName, getKontentTypeTypeName, RICH_TEXT_ELEMENT_TYPE_NAME, PREFERRED_LANGUAGE_IDENTIFIER, getKontentItemInterfaceName } from "./naming";
import { IWebhookDeliveryItem, IWebhookDeliveryResponse, IWebhookMessage, IWebhookWorkflowDataItem, IWebhookWorkflowResponse } from '@kentico/kontent-webhook-helper';
import _ from 'lodash';

const parseKontentWebhookBody = (api: SourceNodesArgs): IWebhookDeliveryResponse | IWebhookWorkflowResponse | null => {

  if ((api.webhookBody as IWebhookDeliveryResponse)?.message?.api_name === "delivery_preview" || (api.webhookBody as IWebhookDeliveryResponse)?.message?.api_name === "delivery_production") {
    const parsedBody = api.webhookBody as IWebhookDeliveryResponse;

    const isCorrectStructure = parsedBody?.data?.items?.every(item => item.language && item.id)
      && parsedBody?.message?.api_name
      && parsedBody?.message?.project_id
      && parsedBody?.message?.operation !== null;

    if (isCorrectStructure) {
      return parsedBody;
    }
  }
  else if ((api.webhookBody as IWebhookWorkflowResponse)?.message?.api_name === "content_management") {
    const parsedBody = api.webhookBody as IWebhookWorkflowResponse;

    const isCorrectStructure = parsedBody?.data?.items?.every(item => item.language && item.transition_from && item.transition_to && item.item.id)
      && parsedBody?.message?.api_name
      && parsedBody?.message?.project_id
      && parsedBody?.message?.operation !== null;

    if (isCorrectStructure) {
      return parsedBody;
    }
  }

  return null;
}

const isKontentSupportedWebhook = (message: IWebhookMessage, pluginConfig: CustomPluginOptions): boolean => {
  const isCorrectProject = message.project_id === pluginConfig.projectId;
  const isPreviewWebhook = 'delivery_preview' === message.api_name
    && ['upsert', 'archive', 'restore'].includes(message.operation);
  const isBuildWebhook = 'delivery_production' === message.api_name
    && ['publish', 'unpublish'].includes(message.operation);
  const isWorkflowWebhook = 'content_management' === message.api_name
    && message.operation === 'change_workflow_step';
  const isCorrectMessageType = message.type == 'content_item_variant';

  return isCorrectProject
    && (isPreviewWebhook || isBuildWebhook || (isWorkflowWebhook && pluginConfig?.experimental?.managementApiTriggersUpdate))
    && isCorrectMessageType
};

const createNodeFromRawKontentItem = (api: SourceNodesArgs, rawKontentItem: KontentItemInput, includeRawContent: boolean, preferredLanguage: string): string => {
  addPreferredLanguageProperty([rawKontentItem], preferredLanguage);
  alterRichTextElements([rawKontentItem]);
  const nodeData = getKontentItemLanguageVariantArtifact(
    api,
    rawKontentItem,
    includeRawContent,
  );
  api.actions.createNode(nodeData);
  return nodeData.id;
}

const isContentComponent = (data: KontentItem): boolean => {
  // Components have substring 01 in its id starting at position 14.
  // xxxxxxxx-xxxx-01xx-xxxx-xxxxxxxxxxxx
  const id = data?.system?.id;
  return id !== null && id.substring(14, 16) === "01";
}

const handleUpsertItem = async (
  api: SourceNodesArgs,
  pluginConfig: CustomPluginOptions,
  itemId: string,
  itemLanguage?: string
): Promise<string[]> => {

  // TODO - language codename is not provided for management call
  if (itemLanguage && !pluginConfig.languageCodenames.includes(itemLanguage)) {
    api.reporter.verbose(`Cant find specified language ${itemLanguage} in plugin configuration`);
    return [];
  }

  // TODO could be optimized to by checking the fallback structure and save some requests
  // not recreate the ones that has different system.language
  // be careful on fallback language - verify cz->de->en fallbacks

  const createdItemsIds = [];
  for (const lang of pluginConfig.languageCodenames) {
    const { item: kontentItem, modularKontent } = await client.loadKontentItem(itemId, lang, pluginConfig, true);
    if (kontentItem === undefined) {
      api.reporter.verbose(`Kontent item (${itemId}) language variant (${lang}) not found on the kontent delivery API for update`);
      continue;
    }

    const nodeId = createNodeFromRawKontentItem(api, kontentItem, pluginConfig.includeRawContent, lang);
    createdItemsIds.push(nodeId);

    for (const key in modularKontent) {
      if (Object.prototype.hasOwnProperty.call(modularKontent, key)) {
        const modularKontentItem = modularKontent[key];
        const nodeId = createNodeFromRawKontentItem(api, modularKontentItem, pluginConfig.includeRawContent, lang);
        createdItemsIds.push(nodeId);
      }
    }
  }

  return createdItemsIds;
}

const handleDeleteItem = async (
  api: SourceNodesArgs,
  pluginConfig: CustomPluginOptions
): Promise<string[]> => {

  const itemInfo = (api.webhookBody as IWebhookDeliveryResponse)?.data.items[0];

  if (!pluginConfig.languageCodenames.includes(itemInfo.language)) {
    api.reporter.verbose(`Cant find specified language ${itemInfo.language} in plugin configuration`);
    return [];
  }

  // TODO could be optimized to by checking the fallback structure and save some requests
  // not recreate the ones that has different system.language
  // be careful on fallback language - verify cz->de->en fallbacks

  const touchedItemsIds = [];
  for (const lang of pluginConfig.languageCodenames) {
    const { item: kontentItem, modularKontent } = await client.loadKontentItem(itemInfo.id, lang, pluginConfig, true);
    if (kontentItem === undefined) { //item  was deleted (with content components)
      const idString = getKontentItemNodeStringForId(itemInfo.id, lang);
      const node = api.getNode(api.createNodeId(idString));

      // Remove content components
      const kontentItemNodes: KontentItem[] = api.getNodes()
        .filter((node: Node) => node.internal.type.startsWith(getKontentItemInterfaceName()))
        .map(node => node as KontentItem);

      const modularItemCodenames = _.flatMap(
        Object.values((node as KontentItem).elements)
          .filter(element => element.type === RICH_TEXT_ELEMENT_TYPE_NAME)
          .map(richTextElement => richTextElement.modular_content)
      );

      modularItemCodenames.forEach(modularItemCodename => {
        const candidate = kontentItemNodes.find((candidateNode) =>
          candidateNode?.system?.codename === modularItemCodename
          && candidateNode[PREFERRED_LANGUAGE_IDENTIFIER] === node[PREFERRED_LANGUAGE_IDENTIFIER])

        if (candidate && isContentComponent(candidate)) {
          touchedItemsIds.push(candidate.id);
          api.actions.deleteNode(candidate);
        }
      })


      if (node) {
        touchedItemsIds.push(node.id);
        api.actions.deleteNode(node);
      }
      continue;
    } else { // fallback version still available
      const nodeId = createNodeFromRawKontentItem(api, kontentItem, pluginConfig.includeRawContent, lang);
      touchedItemsIds.push(nodeId);

      for (const key in modularKontent) {
        if (Object.prototype.hasOwnProperty.call(modularKontent, key)) {
          const modularKontentItem = modularKontent[key];
          const nodeId = createNodeFromRawKontentItem(api, modularKontentItem, pluginConfig.includeRawContent, lang);
          touchedItemsIds.push(nodeId);
        }
      }
    }
  }

  return touchedItemsIds;
}

const handleIncomingWebhook = async (
  api: SourceNodesArgs,
  pluginConfig: CustomPluginOptions,
  itemTypes: string[],
): Promise<void> => {

  const webhook = parseKontentWebhookBody(api);

  if (webhook === null) {
    api.reporter.verbose('Webhook ignored - webhook does not come from Kontent');
    return;
  }

  if (!isKontentSupportedWebhook(webhook.message, pluginConfig)) {
    api.reporter.verbose('This Kontent webhook is not handled by the Gatsby source kontent source plugin');
    return;
  }

  api.reporter.verbose(`Handling ${webhook.message.operation} from ${webhook.message.api_name} API`);
  if (webhook.data.items.length > 1) {
    api.reporter.warn(`Webhook contains more than one item! - contains (${webhook.data.items.length})`)
  }

  const processedItemIds: string[] = [];
  if (webhook.message.api_name === 'delivery_preview') {

    const item = (webhook as IWebhookDeliveryResponse).data.items[0];

    // TODO: Webhook header signature (once headers are available)
    // use signatureHelper '@kentico/kontent-webhook-helper'
    // https://github.com/gatsbyjs/gatsby/issues/23593

    if (webhook.message.operation === "upsert" || webhook.message.operation === "restore") {
      const processedIds = await handleUpsertItem(api, pluginConfig, item.id, item.language);
      processedItemIds.push(...processedIds);
    }

    if (webhook.message.operation === "archive") {
      const processedIds = await handleDeleteItem(api, pluginConfig);
      processedItemIds.push(...processedIds);
    }
  } else if (webhook.message.api_name === 'delivery_production') {

    const item = (webhook as IWebhookDeliveryResponse).data.items[0];

    // TODO: Webhook header signature (once headers are available)
    // use signatureHelper '@kentico/kontent-webhook-helper'
    // https://github.com/gatsbyjs/gatsby/issues/23593

    if (webhook.message.operation === "publish") {
      const processedIds = await handleUpsertItem(api, pluginConfig, item.id, item.language);
      processedItemIds.push(...processedIds);
    }

    if (webhook.message.operation === "unpublish") {
      const processedIds = await handleDeleteItem(api, pluginConfig);
      processedItemIds.push(...processedIds);
    }
  } else if (pluginConfig?.experimental?.managementApiTriggersUpdate && webhook.message.api_name === 'content_management') {

    const item = (webhook as IWebhookWorkflowResponse).data.items[0];

    // TODO: Webhook header signature (once headers are available)
    // use signatureHelper '@kentico/kontent-webhook-helper'
    // https://github.com/gatsbyjs/gatsby/issues/23593

    if (webhook.message.operation === "change_workflow_step") {
      const processedIds = await handleUpsertItem(api, pluginConfig, item.item.id);
      processedItemIds.push(...processedIds);
    } else {
      api.reporter.verbose(`Operation '${webhook.message.operation}' is not supported yet!`);
    }
  }
  else {
    api.reporter.verbose(`Webhook is not supported yet!`);
    api.reporter.verbose(JSON.stringify(webhook, null, 2));
    return;
  }

  for (const itemType of itemTypes) {
    const itemsToTouch = api.getNodesByType(itemType);
    itemsToTouch
      .filter(item => !processedItemIds.includes(item.id))
      .forEach(itemToTouch => api.actions.touchNode(itemToTouch))
  }

  if (pluginConfig.includeTaxonomies) {
    const taxonomies = api.getNodesByType(getKontentTaxonomyTypeName());
    for (const taxonomy of taxonomies) {
      api.actions.touchNode(taxonomy);
    }
  }

  if (pluginConfig.includeTypes) {
    const types = api.getNodesByType(getKontentTypeTypeName());
    for (const type of types) {
      api.actions.touchNode(type);
    }
  }
}

export {
  handleIncomingWebhook
}

