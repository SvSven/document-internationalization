import _ from 'lodash'
import {SanityDocument} from '@sanity/client'
import {ITranslationRef, Ti18nSchema} from '../types'
import {ReferenceBehavior} from '../constants'
import {getSanityClient} from './getSanityClient'
import {getConfig} from './getConfig'
import {getSchema} from './getSchema'
import {getLanguagesFromOption} from './getLanguagesFromOption'
import {getLanguageFromId} from './getLanguageFromId'
import {getBaseLanguage} from './getBaseLanguage'
import {getTranslationsFor} from './getTranslationsForId'
import {getBaseIdFromId} from './getBaseIdFromId'
import {createSanityReference} from './createSanityReference'

// @TODO make this into a hook so the hook
// can look up the existance of a base document on its own
export async function updateIntlFieldsForDocument(
  document: SanityDocument,
  baseDocument?: SanityDocument
): Promise<void> {
  const {_type: type, _id: id} = document
  const schema = getSchema<Ti18nSchema>(type)
  const config = getConfig(schema)
  const client = getSanityClient()
  const baseDocumentId = getBaseIdFromId(id)
  const isTranslation = id !== baseDocumentId
  const fieldName = config.fieldNames.lang
  const refsFieldName = config.fieldNames.references
  const baseRefFieldName = config.fieldNames.baseReference
  const langs = await getLanguagesFromOption(config.languages, document)
  const languageId = getLanguageFromId(id) || getBaseLanguage(langs, config.base)?.id

  // Update I18n field for current document
  const currentDocumentTransaction = client.transaction()
  currentDocumentTransaction.createIfNotExists({_id: id, _type: type})
  currentDocumentTransaction.patch(id, {
    set: {
      // [fieldName]: languageId,
      ...(isTranslation && config.referenceBehavior !== ReferenceBehavior.DISABLED
        ? {
            [baseRefFieldName]: createSanityReference(
              baseDocumentId,
              config.referenceBehavior === ReferenceBehavior.WEAK
            ),
          }
        : {}),
    },
  })
  await currentDocumentTransaction.commit()

  // update base document reference if required
  if (baseDocument) {
    const translatedDocuments = await getTranslationsFor(baseDocumentId)
    if (translatedDocuments.length > 0) {
      const baseDocumentTransaction = client.transaction()
      let translatedRefs: ITranslationRef[] = []
      if (config.referenceBehavior !== ReferenceBehavior.DISABLED) {
        translatedRefs = _.compact(
          translatedDocuments.map((doc) => {
            const lang = getLanguageFromId(doc._id)
            if (!lang) return null
            return {
              _key: lang,
              ...createSanityReference(
                doc._id,
                config.referenceBehavior === ReferenceBehavior.WEAK
              ),
            }
          }, {})
        )
      }
      // baseDocumentTransaction.createIfNotExists({_id: baseDocumentId, _type: type})
      baseDocumentTransaction.patch(baseDocumentId, {
        set: {
          [refsFieldName]: translatedRefs,
        },
      })
      await baseDocumentTransaction.commit()
    }
  }
}
