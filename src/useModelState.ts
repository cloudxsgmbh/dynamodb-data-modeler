import { useState, useCallback } from 'react'
import {
  DefaultSchema,
  getValue,
  assignValue,
  deepClone,
  createSchema,
  expandValueTemplates,
  addEntityToSchema,
  runQuery,
  fakeUUID,
  typeToDynamo,
  DYNAMO_TYPES,
  saveFile,
  exportOneTableSchema,
  importOneTableSchema,
  type Model,
  type DataModel,
  type DynamoItem,
  type Schema,
  type TableConfig,
  type SavedQuery,
  type GSI,
} from './modelUtils'

const MAX_UNDO = 50

type TableChanges = Record<string, DataModel[]>

// ── helpers ───────────────────────────────────────────────────────────────────

function makeChange(
  currentModel: Model,
  currentModelIndex: number,
  currentDatamodel: DataModel,
  currentChanges: TableChanges,
): TableChanges {
  const tableName = currentModel.DataModel[currentModelIndex].TableName
  const changes = { ...currentChanges }
  if (!changes[tableName]) changes[tableName] = []
  changes[tableName] = [
    ...changes[tableName].slice(-MAX_UNDO + 1),
    deepClone(currentDatamodel),
  ]
  return changes
}

// ── return type ───────────────────────────────────────────────────────────────

export interface ModelState {
  // state
  model: Model
  modelIndex: number
  datamodel: DataModel | null
  jsonData: DynamoItem[]
  table: TableConfig
  schema: Schema
  tableChanges: TableChanges
  showValues: boolean
  matchData: DynamoItem[]
  pasteItem: DynamoItem
  // actions
  createModel: (
    meta: { name: string; author: string; description: string },
    partitionKey: string,
    sortKey: string,
    partKeyType: string,
    sortKeyType: string,
    tableName: string,
  ) => void
  loadModelFromFile: (fileContent: string) => void
  importOneTable: (text: string) => void
  exportOneTable: () => void
  saveModel: () => void
  clearModel: () => void
  loadDataModel: (
    newModel: Model,
    newModelIndex: number,
    newTableChanges: TableChanges,
    newMatchData: DynamoItem[],
  ) => void
  undoChange: () => void
  addItem: (partitionKeyValue: string) => void
  addAttribute: (pkVal: string, skVal: string, attrName: string) => void
  nameAttribute: (pkVal: string, skVal: string, oldName: string, newName: string) => void
  updatePK: (oldPK: string, newPK: string) => void
  updateValue: (pkVal: string, skVal: string, attrName: string, newVal: string) => void
  deletePartition: (pkVal: string) => void
  deleteItem: (pkVal: string, skVal: string) => void
  deleteAttribute: (pkVal: string, skVal: string, attrName: string, applyAll: boolean) => void
  cutItem: (pkVal: string, skVal: string) => void
  copyItem: (pkVal: string, skVal: string) => void
  pasteItemToPartition: (pkVal: string) => void
  movePartition: (pkVal: string, direction: 'up' | 'down') => void
  setValueTemplate: (entityType: string, attrName: string, templateValue: string) => void
  toggleSchema: () => void
  addGSI: (indexName: string, pk: string, sk: string, pkType: string, skType: string) => void
  addNewTable: (tableName: string, pk: string, sk: string, pkType: string, skType: string) => void
  switchTable: (idx: number) => void
  applyQuery: (queryObj: SavedQuery) => void
  clearQuery: () => void
  generateUUID: (pkVal: string, skVal: string, attrName: string) => void
  generateDate: (pkVal: string, skVal: string, attrName: string) => void
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useModelState(): ModelState {
  const emptyTable: TableConfig = { name: '', partition_key: '', sort_key: '', sortkey_datatype: 'S' }

  const [model, setModel] = useState<Model>({ DataModel: [] })
  const [modelIndex, setModelIndex] = useState(0)
  const [datamodel, setDatamodel] = useState<DataModel | null>(null)
  const [jsonData, setJsonData] = useState<DynamoItem[]>([])
  const [table, setTable] = useState<TableConfig>(emptyTable)
  const [schema, setSchema] = useState<Schema>(deepClone(DefaultSchema))
  const [tableChanges, setTableChanges] = useState<TableChanges>({})
  const [showValues, setShowValues] = useState(true)
  const [matchData, setMatchData] = useState<DynamoItem[]>([])
  const [pasteItem, setPasteItem] = useState<DynamoItem>({})

  // ── load / init ─────────────────────────────────────────────────────────────

  const loadDataModel = useCallback(
    (
      newModel: Model,
      newModelIndex: number,
      newTableChanges: TableChanges,
      newMatchData: DynamoItem[],
    ) => {
      const dm = newModel.DataModel[newModelIndex]
      let sc: Schema
      if (!dm.ModelSchema) {
        sc = createSchema(dm)
        dm.ModelSchema = sc
      } else {
        sc = dm.ModelSchema
      }

      const tbl: TableConfig = {
        name: dm.TableName,
        partition_key: dm.KeyAttributes.PartitionKey.AttributeName,
        sort_key: dm.KeyAttributes.SortKey?.AttributeName ?? '',
        sortkey_datatype: dm.KeyAttributes.SortKey?.AttributeType ?? 'S',
      }

      const data = [...dm.TableData]
      expandValueTemplates(data, sc)

      const displayData = newMatchData.length > 0 ? newMatchData : data

      const changes = { ...newTableChanges }
      if (!changes[dm.TableName]) changes[dm.TableName] = []

      setModel(newModel)
      setModelIndex(newModelIndex)
      setDatamodel(dm)
      setJsonData(displayData)
      setTable(tbl)
      setSchema(sc)
      setTableChanges(changes)
      setMatchData(newMatchData)
    },
    [],
  )

  // ── create model ─────────────────────────────────────────────────────────────

  const createModel = useCallback(
    (
      meta: { name: string; author: string; description: string },
      partitionKey: string,
      sortKey: string,
      partKeyType: string,
      sortKeyType: string,
      tableName: string,
    ) => {
      const date = new Date()
      const dm: DataModel = {
        TableName: tableName,
        KeyAttributes: {
          PartitionKey: { AttributeName: partitionKey, AttributeType: partKeyType || 'S' },
          SortKey: sortKey ? { AttributeName: sortKey, AttributeType: sortKeyType || 'S' } : undefined,
        },
        NonKeyAttributes: [],
        GlobalSecondaryIndexes: [],
        TableData: [],
      }

      const newModel: Model = {
        ModelName: meta.name,
        ModelMetadata: {
          Author: meta.author,
          DateCreated: date,
          DateLastModified: date,
          Description: meta.description,
          AWSService: 'Amazon DynamoDB',
          Version: '2.0',
        },
        DataModel: [dm],
      }

      dm.ModelSchema = createSchema(dm)

      const newItem: DynamoItem = {}
      newItem[partitionKey] = { S: '~new~' }
      if (sortKey) newItem[sortKey] = { S: '~new~' }
      newItem['type'] = { S: '~new~' }
      dm.TableData.push(newItem)

      loadDataModel(newModel, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── add GSI ──────────────────────────────────────────────────────────────────

  const addGSI = useCallback(
    (indexName: string, pk: string, sk: string, pkType: string, skType: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const gsi: GSI = {
        IndexName: indexName,
        KeyAttributes: {
          PartitionKey: { AttributeName: pk, AttributeType: pkType || 'S' },
          SortKey: sk ? { AttributeName: sk, AttributeType: skType || 'S' } : undefined,
        },
        Projection: { ProjectionType: 'ALL' },
      }
      dm.GlobalSecondaryIndexes.push(gsi)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── switch table ─────────────────────────────────────────────────────────────

  const switchTable = useCallback(
    (idx: number) => {
      if (idx === -1) return
      loadDataModel(model, idx, tableChanges, [])
    },
    [model, tableChanges, loadDataModel],
  )

  // ── add new table ────────────────────────────────────────────────────────────

  const addNewTable = useCallback(
    (tableName: string, pk: string, sk: string, pkType: string, skType: string) => {
      const newModel = deepClone(model)
      const dm: DataModel = {
        TableName: tableName,
        KeyAttributes: {
          PartitionKey: { AttributeName: pk, AttributeType: pkType || 'S' },
          SortKey: sk ? { AttributeName: sk, AttributeType: skType || 'S' } : undefined,
        },
        NonKeyAttributes: [],
        GlobalSecondaryIndexes: [],
        TableData: [],
      }
      newModel.DataModel.push(dm)

      const newItem: DynamoItem = {}
      newItem[pk] = { S: '~new~' }
      if (sk) newItem[sk] = { S: '~new~' }
      newItem['type'] = { S: '~new~' }
      dm.TableData.push(newItem)

      loadDataModel(newModel, newModel.DataModel.length - 1, tableChanges, [])
    },
    [model, tableChanges, loadDataModel],
  )

  // ── undo ─────────────────────────────────────────────────────────────────────

  const undoChange = useCallback(() => {
    const tableName = model.DataModel[modelIndex].TableName
    const stack = tableChanges[tableName] ?? []
    if (stack.length === 0) return

    const newModel = deepClone(model)
    const newChanges = { ...tableChanges }
    newChanges[tableName] = stack.slice(0, -1)
    newModel.DataModel[modelIndex] = stack[stack.length - 1]

    loadDataModel(newModel, modelIndex, newChanges, [])
  }, [model, modelIndex, tableChanges, loadDataModel])

  // ── add item ─────────────────────────────────────────────────────────────────

  const addItem = useCallback(
    (partitionKeyValue: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName

      const newItem: DynamoItem = {}
      newItem[pk] = { S: partitionKeyValue || '~new~' }
      if (sk) newItem[sk] = { S: '~new~' }
      newItem['type'] = { S: '~new~' }

      if (sk) {
        let suffix = ''
        let counter = 0
        while (
          dm.TableData.some(
            (o) =>
              getValue(o[pk]) === (partitionKeyValue || '~new~') &&
              getValue(o[sk]) === '~new~' + suffix,
          )
        ) {
          counter++
          suffix = String(counter)
          newItem[sk] = { S: '~new~' + suffix }
        }
      }

      dm.TableData.push(newItem)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── add attribute ────────────────────────────────────────────────────────────

  const addAttribute = useCallback(
    (pkVal: string, skVal: string, attrName: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          obj[attrName] = { S: '~new~' }
          const type = getValue(obj['type'])
          if (type && type !== '~new~') {
            for (const other of dm.TableData) {
              if (other !== obj && getValue(other['type']) === type) {
                other[attrName] = { S: '~new~' }
              }
            }
          }
          break
        }
      }

      dm.ModelSchema = schema
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── rename attribute ─────────────────────────────────────────────────────────

  const nameAttribute = useCallback(
    (pkVal: string, skVal: string, oldName: string, newName: string) => {
      if (!newName || newName === oldName) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      let entityType: string | null = null

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          entityType = getValue(obj['type'])
          const val = obj[oldName]
          delete obj[oldName]
          obj[newName] = val ?? { S: '~new~' }
          break
        }
      }

      if (entityType && entityType !== '~new~') {
        for (const obj of dm.TableData) {
          if (getValue(obj['type']) === entityType && Object.prototype.hasOwnProperty.call(obj, oldName)) {
            const val = obj[oldName]
            delete obj[oldName]
            obj[newName] = val ?? { S: '~new~' }
          }
        }
        const sc = deepClone(schema)
        if (sc.models[entityType]?.[oldName]) {
          sc.models[entityType][newName] = sc.models[entityType][oldName]
          delete sc.models[entityType][oldName]
        }
        dm.ModelSchema = sc
        loadDataModel(newModel, modelIndex, changes, matchData)
        return
      }

      dm.ModelSchema = schema
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── update PK ────────────────────────────────────────────────────────────────

  const updatePK = useCallback(
    (oldPK: string, newPK: string) => {
      if (oldPK === newPK) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === oldPK) assignValue(obj[pk], newPK)
      }

      dm.ModelSchema = schema
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── update attribute value ───────────────────────────────────────────────────

  const updateValue = useCallback(
    (pkVal: string, skVal: string, attrName: string, newVal: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      const sc = deepClone(schema)

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          if (!showValues) {
            if (attrName !== 'type') {
              const type = getValue(obj['type'])
              const entity = sc.models[type]
              if (!entity) break
              const field = entity[attrName] ?? {}
              if (Object.keys(DYNAMO_TYPES).includes(newVal)) {
                field.type = newVal
                for (const item of dm.TableData) {
                  if (item[attrName]) {
                    item[attrName] = { [typeToDynamo(newVal)]: getValue(item[attrName]) }
                  }
                }
              } else {
                field.value = newVal
              }
              entity[attrName] = field
            }
            dm.ModelSchema = sc
            loadDataModel(newModel, modelIndex, changes, matchData)
            return
          }

          if (getValue(obj[attrName]) === newVal) break

          if (sk && attrName === sk) {
            const pkValue = getValue(obj[pk])
            if (dm.TableData.some((o) => getValue(o[pk]) === pkValue && getValue(o[sk]) === newVal)) break
          }

          if (obj[attrName]) {
            assignValue(obj[attrName], newVal)
          } else {
            obj[attrName] = { S: newVal }
          }

          if (attrName === 'type') {
            const oldKeys = Object.keys(obj).filter((k) => k !== pk && k !== sk && k !== 'type')
            for (const k of oldKeys) delete obj[k]

            if (sc.models[newVal]) {
              for (const [prop, field] of Object.entries(sc.models[newVal])) {
                if (![pk, sk, 'type'].includes(prop)) {
                  obj[prop] = { S: field.default ?? '~new~' }
                }
              }
            } else {
              addEntityToSchema(obj, sc)
            }
          }
          break
        }
      }

      dm.ModelSchema = sc
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, showValues, tableChanges, matchData, loadDataModel],
  )

  // ── delete partition ─────────────────────────────────────────────────────────

  const deletePartition = useCallback(
    (pkVal: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      dm.TableData = dm.TableData.filter((obj) => getValue(obj[pk]) !== pkVal)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── delete item ──────────────────────────────────────────────────────────────

  const deleteItem = useCallback(
    (pkVal: string, skVal: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      dm.TableData = dm.TableData.filter(
        (obj) => !(getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)),
      )
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── delete attribute ─────────────────────────────────────────────────────────

  const deleteAttribute = useCallback(
    (pkVal: string, skVal: string, attrName: string, applyAll: boolean) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)
      const sc = deepClone(schema)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      let entityType: string | null = null

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          entityType = getValue(obj['type'])
          delete obj[attrName]
          break
        }
      }

      if (applyAll && entityType && entityType !== '~new~') {
        for (const obj of dm.TableData) {
          if (getValue(obj['type']) === entityType) delete obj[attrName]
        }
        if (sc.models[entityType]) delete sc.models[entityType][attrName]
      }

      dm.ModelSchema = sc
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── cut / copy / paste ───────────────────────────────────────────────────────

  const cutItem = useCallback(
    (pkVal: string, skVal: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      let cut: DynamoItem | null = null

      dm.TableData = dm.TableData.filter((obj) => {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          cut = deepClone(obj)
          return false
        }
        return true
      })
      dm.ModelSchema = schema
      if (cut) setPasteItem(cut)

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  const copyItem = useCallback(
    (pkVal: string, skVal: string) => {
      if (!datamodel) return
      const pk = datamodel.KeyAttributes.PartitionKey.AttributeName
      const sk = datamodel.KeyAttributes.SortKey?.AttributeName
      const item = datamodel.TableData.find(
        (o) => getValue(o[pk]) === pkVal && (!sk || getValue(o[sk]) === skVal),
      )
      if (item) setPasteItem(deepClone(item))
    },
    [datamodel],
  )

  const pasteItemToPartition = useCallback(
    (pkVal: string) => {
      if (Object.keys(pasteItem).length === 0) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const item = deepClone(pasteItem)
      item[pk] = { S: pkVal }
      dm.TableData.push(item)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, pasteItem, tableChanges, matchData, loadDataModel],
  )

  // ── move partition ───────────────────────────────────────────────────────────

  const movePartition = useCallback(
    (pkVal: string, direction: 'up' | 'down') => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel!, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const seen: string[] = []
      for (const obj of dm.TableData) {
        const v = getValue(obj[pk])
        if (!seen.includes(v)) seen.push(v)
      }

      const idx = seen.indexOf(pkVal)
      if (idx < 0) return
      const swap = direction === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= seen.length) return

      ;[seen[idx], seen[swap]] = [seen[swap], seen[idx]]

      const newData: DynamoItem[] = []
      for (const unique of seen) {
        for (const obj of dm.TableData) {
          if (getValue(obj[pk]) === unique) newData.push(obj)
        }
      }
      dm.TableData = newData
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, loadDataModel],
  )

  // ── value template ───────────────────────────────────────────────────────────

  const setValueTemplate = useCallback(
    (entityType: string, attrName: string, templateValue: string) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const sc = deepClone(schema)

      if (!sc.models[entityType]) sc.models[entityType] = {}
      if (!sc.models[entityType][attrName]) sc.models[entityType][attrName] = {}
      sc.models[entityType][attrName].value = templateValue

      dm.ModelSchema = sc
      loadDataModel(newModel, modelIndex, tableChanges, matchData)
    },
    [model, modelIndex, schema, tableChanges, matchData, loadDataModel],
  )

  // ── save model ───────────────────────────────────────────────────────────────

  const saveModel = useCallback(() => {
    const exportModel = deepClone(model)
    if (!exportModel.ModelName) {
      const date = new Date()
      exportModel.ModelName = 'export'
      exportModel.ModelMetadata = {
        Author: 'unknown',
        DateCreated: date.toDateString(),
        DateLastModified: date.toDateString(),
        Description: '',
        AWSService: 'Amazon DynamoDB',
        Version: '2.0',
      }
    }
    for (const dm of exportModel.DataModel ?? []) {
      if (dm.ModelSchema) dm.ModelSchema.data = []
    }
    saveFile(JSON.stringify(exportModel), (exportModel.ModelName ?? 'export') + '.json', 'json')
  }, [model])

  // ── load model from file ─────────────────────────────────────────────────────

  const loadModelFromFile = useCallback(
    (fileContent: string) => {
      const newModel = JSON.parse(fileContent) as Model
      if (newModel.ModelSchema) {
        newModel.DataModel[0].ModelSchema = newModel.ModelSchema
        delete newModel.ModelSchema
      }
      loadDataModel(newModel, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── import OneTable ──────────────────────────────────────────────────────────

  const importOneTable = useCallback(
    (text: string) => {
      const result = importOneTableSchema(text)
      loadDataModel(result.model, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── export OneTable ──────────────────────────────────────────────────────────

  const exportOneTable = useCallback(() => {
    const json = exportOneTableSchema(schema, datamodel?.TableData ?? [])
    saveFile(json, 'schema.json', 'json')
  }, [schema, datamodel])

  // ── run query ────────────────────────────────────────────────────────────────

  const applyQuery = useCallback(
    (queryObj: SavedQuery) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]

      if (queryObj.name) {
        if (!dm.SavedQuery) dm.SavedQuery = {}
        dm.SavedQuery[queryObj.name] = queryObj
      }
      dm.ModelSchema = schema

      const result = runQuery(queryObj, dm.TableData, table, dm.GlobalSecondaryIndexes ?? [])
      setMatchData(result)
      loadDataModel(newModel, modelIndex, tableChanges, result)
    },
    [model, modelIndex, schema, table, tableChanges, loadDataModel],
  )

  const clearQuery = useCallback(() => {
    setMatchData([])
    loadDataModel(model, modelIndex, tableChanges, [])
  }, [model, modelIndex, tableChanges, loadDataModel])

  // ── toggle schema view ───────────────────────────────────────────────────────

  const toggleSchema = useCallback(() => setShowValues((v) => !v), [])

  // ── clear model ──────────────────────────────────────────────────────────────

  const clearModel = useCallback(() => {
    setModel({ DataModel: [] })
    setModelIndex(0)
    setDatamodel(null)
    setJsonData([])
    setTable(emptyTable)
    setSchema(deepClone(DefaultSchema))
    setTableChanges({})
    setMatchData([])
    setPasteItem({})
    setShowValues(true)
  }, [])

  // ── generate value ───────────────────────────────────────────────────────────

  const generateUUID = useCallback(
    (pkVal: string, skVal: string, attrName: string) => updateValue(pkVal, skVal, attrName, fakeUUID()),
    [updateValue],
  )

  const generateDate = useCallback(
    (pkVal: string, skVal: string, attrName: string) =>
      updateValue(pkVal, skVal, attrName, new Date().toISOString().split('.')[0]),
    [updateValue],
  )

  return {
    model,
    modelIndex,
    datamodel,
    jsonData,
    table,
    schema,
    tableChanges,
    showValues,
    matchData,
    pasteItem,
    createModel,
    loadModelFromFile,
    importOneTable,
    exportOneTable,
    saveModel,
    clearModel,
    loadDataModel,
    undoChange,
    addItem,
    addAttribute,
    nameAttribute,
    updatePK,
    updateValue,
    deletePartition,
    deleteItem,
    deleteAttribute,
    cutItem,
    copyItem,
    pasteItemToPartition,
    movePartition,
    setValueTemplate,
    toggleSchema,
    addGSI,
    addNewTable,
    switchTable,
    applyQuery,
    clearQuery,
    generateUUID,
    generateDate,
  }
}
