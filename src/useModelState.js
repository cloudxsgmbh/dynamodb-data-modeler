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
} from './modelUtils'

const MAX_UNDO = 50

export function useModelState() {
  const [model, setModel] = useState({})
  const [modelIndex, setModelIndex] = useState(0)
  const [datamodel, setDatamodel] = useState(null)
  const [jsonData, setJsonData] = useState([])
  const [table, setTable] = useState({})
  const [schema, setSchema] = useState(deepClone(DefaultSchema))
  const [tableChanges, setTableChanges] = useState({})
  const [showValues, setShowValues] = useState(true)
  const [matchData, setMatchData] = useState([])
  const [pasteItem, setPasteItem] = useState({})

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Push a snapshot onto the undo stack for the current table */
  const makeChange = useCallback(
    (currentModel, currentModelIndex, currentDatamodel, currentChanges) => {
      const tableName = currentModel.DataModel[currentModelIndex].TableName
      const changes = { ...currentChanges }
      if (!changes[tableName]) changes[tableName] = []
      changes[tableName] = [
        ...changes[tableName].slice(-MAX_UNDO + 1),
        deepClone(currentDatamodel),
      ]
      return changes
    },
    [],
  )

  // ── load / init ───────────────────────────────────────────────────────────

  const loadDataModel = useCallback(
    (newModel, newModelIndex, newTableChanges, newMatchData) => {
      const dm = newModel.DataModel[newModelIndex]
      let sc
      if (!dm.ModelSchema) {
        sc = createSchema(dm)
        dm.ModelSchema = sc
      } else {
        sc = dm.ModelSchema
      }

      const tbl = {
        name: dm.TableName,
        partition_key: dm.KeyAttributes.PartitionKey.AttributeName,
        sort_key: dm.KeyAttributes.SortKey?.AttributeName || '',
        sortkey_datatype: dm.KeyAttributes.SortKey?.AttributeType || 'S',
      }

      let data = [...dm.TableData]
      expandValueTemplates(data, sc)

      const displayData = newMatchData && newMatchData.length > 0 ? newMatchData : data

      const changes = { ...newTableChanges }
      if (!changes[dm.TableName]) changes[dm.TableName] = []

      setModel(newModel)
      setModelIndex(newModelIndex)
      setDatamodel(dm)
      setJsonData(displayData)
      setTable(tbl)
      setSchema(sc)
      setTableChanges(changes)
      setMatchData(newMatchData || [])
    },
    [],
  )

  // ── create model ──────────────────────────────────────────────────────────

  const createModel = useCallback(
    ({ name, author, description }, partitionKey, sortKey, partKeyType, sortKeyType, tableName) => {
      const date = new Date()
      const dm = {
        TableName: tableName,
        KeyAttributes: {
          PartitionKey: { AttributeName: partitionKey, AttributeType: partKeyType || 'S' },
          SortKey: sortKey ? { AttributeName: sortKey, AttributeType: sortKeyType || 'S' } : null,
        },
        NonKeyAttributes: [],
        GlobalSecondaryIndexes: [],
        TableData: [],
      }
      if (!sortKey) delete dm.KeyAttributes.SortKey

      const newModel = {
        ModelName: name,
        ModelMetadata: {
          Author: author,
          DateCreated: date,
          DateLastModified: date,
          Description: description,
          AWSService: 'Amazon DynamoDB',
          Version: '2.0',
        },
        DataModel: [dm],
      }

      const sc = createSchema(dm)
      dm.ModelSchema = sc

      // Add initial placeholder item
      const newItem = {}
      newItem[partitionKey] = { S: '~new~' }
      if (sortKey) newItem[sortKey] = { S: '~new~' }
      newItem.type = { S: '~new~' }
      dm.TableData.push(newItem)

      loadDataModel(newModel, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── add GSI ───────────────────────────────────────────────────────────────

  const addGSI = useCallback(
    (indexName, partitionKey, sortKey, partKeyType, sortKeyType) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]

      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const gsi = {
        IndexName: indexName,
        KeyAttributes: {
          PartitionKey: { AttributeName: partitionKey, AttributeType: partKeyType || 'S' },
          SortKey: sortKey
            ? { AttributeName: sortKey, AttributeType: sortKeyType || 'S' }
            : undefined,
        },
        Projection: { ProjectionType: 'ALL' },
      }
      if (!gsi.KeyAttributes.SortKey) delete gsi.KeyAttributes.SortKey
      dm.GlobalSecondaryIndexes.push(gsi)

      // Preserve the current schema
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── switch table ──────────────────────────────────────────────────────────

  const switchTable = useCallback(
    (idx) => {
      if (idx === -1) return // caller should open add-table dialog
      loadDataModel(model, idx, tableChanges, [])
    },
    [model, tableChanges, loadDataModel],
  )

  // ── add new table to model ────────────────────────────────────────────────

  const addNewTable = useCallback(
    (tableName, partitionKey, sortKey, partKeyType, sortKeyType) => {
      const newModel = deepClone(model)
      const dm = {
        TableName: tableName,
        KeyAttributes: {
          PartitionKey: { AttributeName: partitionKey, AttributeType: partKeyType || 'S' },
          SortKey: sortKey ? { AttributeName: sortKey, AttributeType: sortKeyType || 'S' } : null,
        },
        NonKeyAttributes: [],
        GlobalSecondaryIndexes: [],
        TableData: [],
      }
      if (!sortKey) delete dm.KeyAttributes.SortKey
      newModel.DataModel.push(dm)

      const newItem = {}
      newItem[partitionKey] = { S: '~new~' }
      if (sortKey) newItem[sortKey] = { S: '~new~' }
      newItem.type = { S: '~new~' }
      dm.TableData.push(newItem)

      const newModelIndex = newModel.DataModel.length - 1
      loadDataModel(newModel, newModelIndex, tableChanges, [])
    },
    [model, tableChanges, loadDataModel],
  )

  // ── undo ──────────────────────────────────────────────────────────────────

  const undoChange = useCallback(() => {
    const tableName = model.DataModel[modelIndex].TableName
    const stack = tableChanges[tableName] || []
    if (stack.length === 0) return

    const newModel = deepClone(model)
    const newChanges = { ...tableChanges }
    newChanges[tableName] = stack.slice(0, -1)
    newModel.DataModel[modelIndex] = stack[stack.length - 1]

    loadDataModel(newModel, modelIndex, newChanges, [])
  }, [model, modelIndex, tableChanges, loadDataModel])

  // ── add item ──────────────────────────────────────────────────────────────

  const addItem = useCallback(
    (partitionKeyValue) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName

      const newItem = {}
      newItem[pk] = { S: partitionKeyValue || '~new~' }
      if (sk) newItem[sk] = { S: '~new~' }
      newItem.type = { S: '~new~' }

      // Ensure unique SK – append counter if needed
      if (sk) {
        let suffix = ''
        let counter = 0
        while (dm.TableData.some(
          (o) =>
            getValue(o[pk]) === (partitionKeyValue || '~new~') &&
            getValue(o[sk]) === '~new~' + suffix,
        )) {
          counter++
          suffix = counter.toString()
          newItem[sk] = { S: '~new~' + suffix }
        }
      }

      dm.TableData.push(newItem)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── add attribute ─────────────────────────────────────────────────────────

  const addAttribute = useCallback(
    (pkVal, skVal, attrName) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          obj[attrName] = { S: '~new~' }
          // propagate to same-type items
          const type = getValue(obj.type)
          if (type && type !== '~new~') {
            for (const other of dm.TableData) {
              if (other !== obj && getValue(other.type) === type) {
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
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── name / rename attribute ───────────────────────────────────────────────

  const nameAttribute = useCallback(
    (pkVal, skVal, oldName, newName) => {
      if (!newName || newName === oldName) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      let entityType = null
      for (const obj of dm.TableData) {
        const pk = dm.KeyAttributes.PartitionKey.AttributeName
        const sk = dm.KeyAttributes.SortKey?.AttributeName
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          entityType = getValue(obj.type)
          // rename key
          const val = obj[oldName]
          delete obj[oldName]
          obj[newName] = val || { S: '~new~' }
          break
        }
      }

      // propagate rename to same-type items
      if (entityType && entityType !== '~new~') {
        for (const obj of dm.TableData) {
          if (getValue(obj.type) === entityType && obj.hasOwnProperty(oldName)) {
            const val = obj[oldName]
            delete obj[oldName]
            obj[newName] = val || { S: '~new~' }
          }
        }
        // update schema model
        const sc = deepClone(schema)
        if (sc.models[entityType] && sc.models[entityType][oldName]) {
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
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── update PK value ───────────────────────────────────────────────────────

  const updatePK = useCallback(
    (oldPK, newPK) => {
      if (oldPK === newPK) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === oldPK) {
          assignValue(obj[pk], newPK)
        }
      }

      dm.ModelSchema = schema
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── update attribute value ────────────────────────────────────────────────

  const updateValue = useCallback(
    (pkVal, skVal, attrName, newVal) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      const sc = deepClone(schema)

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          if (!showValues) {
            // Schema view: update type or value template
            if (attrName === 'type') {
              // switching to values view updates handled in showValues mode
            } else {
              const type = getValue(obj.type)
              const entity = sc.models[type]
              if (!entity) break
              const field = entity[attrName] || {}
              if (Object.keys(DYNAMO_TYPES).includes(newVal)) {
                field.type = newVal
                // update all items of this type
                for (const item of dm.TableData) {
                  if (item[attrName]) {
                    const dynType = typeToDynamo(newVal)
                    const oldVal = getValue(item[attrName])
                    item[attrName] = { [dynType]: oldVal }
                  }
                }
              } else {
                field.value = newVal
              }
              entity[attrName] = field
              sc.models[type] = entity
            }
            dm.ModelSchema = sc
            loadDataModel(newModel, modelIndex, changes, matchData)
            return
          }

          // Values view: update the attribute
          if (getValue(obj[attrName]) === newVal) break

          if (attrName === sk) {
            // Check SK uniqueness
            const pkValue = getValue(obj[pk])
            const duplicate = dm.TableData.some(
              (o) => getValue(o[pk]) === pkValue && getValue(o[sk]) === newVal,
            )
            if (duplicate) break
          }

          if (obj[attrName]) {
            assignValue(obj[attrName], newVal)
          } else {
            obj[attrName] = { S: newVal }
          }

          // If type changed, rebuild attributes
          if (attrName === 'type') {
            const oldKeys = Object.keys(obj).filter(
              (k) => k !== pk && k !== sk && k !== 'type',
            )
            for (const k of oldKeys) delete obj[k]

            if (sc.models[newVal]) {
              for (const [prop, field] of Object.entries(sc.models[newVal])) {
                if (![pk, sk, 'type'].includes(prop)) {
                  obj[prop] = { S: field.default || '~new~' }
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
    [
      model,
      modelIndex,
      datamodel,
      schema,
      showValues,
      tableChanges,
      matchData,
      makeChange,
      loadDataModel,
    ],
  )

  // ── delete partition ──────────────────────────────────────────────────────

  const deletePartition = useCallback(
    (pkVal) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      dm.TableData = dm.TableData.filter((obj) => getValue(obj[pk]) !== pkVal)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── delete item ───────────────────────────────────────────────────────────

  const deleteItem = useCallback(
    (pkVal, skVal) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      dm.TableData = dm.TableData.filter(
        (obj) => !(getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)),
      )
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── delete attribute ──────────────────────────────────────────────────────

  const deleteAttribute = useCallback(
    (pkVal, skVal, attrName, applyAll) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)
      const sc = deepClone(schema)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      let entityType = null

      for (const obj of dm.TableData) {
        if (getValue(obj[pk]) === pkVal && (!sk || getValue(obj[sk]) === skVal)) {
          entityType = getValue(obj.type)
          delete obj[attrName]
          break
        }
      }

      if (applyAll && entityType && entityType !== '~new~') {
        for (const obj of dm.TableData) {
          if (getValue(obj.type) === entityType) delete obj[attrName]
        }
        if (sc.models[entityType]) {
          delete sc.models[entityType][attrName]
        }
      }

      dm.ModelSchema = sc
      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── cut / copy / paste item ───────────────────────────────────────────────

  const cutItem = useCallback(
    (pkVal, skVal) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const sk = dm.KeyAttributes.SortKey?.AttributeName
      let cut = null
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
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  const copyItem = useCallback(
    (pkVal, skVal) => {
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
    (pkVal) => {
      if (Object.keys(pasteItem).length === 0) return

      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      const item = deepClone(pasteItem)
      item[pk] = { S: pkVal }
      dm.TableData.push(item)
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, pasteItem, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── move partition ────────────────────────────────────────────────────────

  const movePartition = useCallback(
    (pkVal, direction) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]
      const changes = makeChange(model, modelIndex, datamodel, tableChanges)

      const pk = dm.KeyAttributes.PartitionKey.AttributeName
      // Get unique PKs in current order
      const seen = []
      for (const obj of dm.TableData) {
        const v = getValue(obj[pk])
        if (!seen.includes(v)) seen.push(v)
      }

      const idx = seen.indexOf(pkVal)
      if (idx < 0) return
      const swap = direction === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= seen.length) return

      ;[seen[idx], seen[swap]] = [seen[swap], seen[idx]]

      const newData = []
      for (const unique of seen) {
        for (const obj of dm.TableData) {
          if (getValue(obj[pk]) === unique) newData.push(obj)
        }
      }
      dm.TableData = newData
      dm.ModelSchema = schema

      loadDataModel(newModel, modelIndex, changes, matchData)
    },
    [model, modelIndex, datamodel, schema, tableChanges, matchData, makeChange, loadDataModel],
  )

  // ── value template ────────────────────────────────────────────────────────

  const setValueTemplate = useCallback(
    (entityType, attrName, templateValue) => {
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

  // ── save model ────────────────────────────────────────────────────────────

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
    // Strip schema.data before export (same as original)
    for (const dm of exportModel.DataModel || []) {
      if (dm.ModelSchema && dm.ModelSchema.data) {
        delete dm.ModelSchema.data
      }
    }
    saveFile(JSON.stringify(exportModel), (exportModel.ModelName || 'export') + '.json', 'json')
  }, [model])

  // ── load model from file ──────────────────────────────────────────────────

  const loadModelFromFile = useCallback(
    (fileContent) => {
      const newModel = JSON.parse(fileContent)
      // Handle old format where ModelSchema was at top level
      if (newModel.ModelSchema) {
        newModel.DataModel[0].ModelSchema = newModel.ModelSchema
        delete newModel.ModelSchema
      }
      loadDataModel(newModel, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── import OneTable ───────────────────────────────────────────────────────

  const importOneTable = useCallback(
    (text) => {
      const result = importOneTableSchema(text)
      loadDataModel(result.model, 0, {}, [])
    },
    [loadDataModel],
  )

  // ── export OneTable ───────────────────────────────────────────────────────

  const exportOneTable = useCallback(() => {
    const json = exportOneTableSchema(schema, datamodel?.TableData || [])
    saveFile(json, 'schema.json', 'json')
  }, [schema, datamodel])

  // ── run query ─────────────────────────────────────────────────────────────

  const applyQuery = useCallback(
    (queryObj) => {
      const newModel = deepClone(model)
      const dm = newModel.DataModel[modelIndex]

      // Save query
      const queryName = queryObj.name
      if (queryName) {
        if (!dm.SavedQuery) dm.SavedQuery = {}
        dm.SavedQuery[queryName] = queryObj
      }
      dm.ModelSchema = schema

      const result = runQuery(
        queryObj,
        dm.TableData,
        table,
        dm.GlobalSecondaryIndexes || [],
      )
      setMatchData(result)
      loadDataModel(newModel, modelIndex, tableChanges, result)
    },
    [model, modelIndex, schema, table, tableChanges, loadDataModel],
  )

  const clearQuery = useCallback(() => {
    setMatchData([])
    loadDataModel(model, modelIndex, tableChanges, [])
  }, [model, modelIndex, tableChanges, loadDataModel])

  // ── toggle schema view ────────────────────────────────────────────────────

  const toggleSchema = useCallback(() => {
    setShowValues((v) => !v)
  }, [])

  // ── clear / reload ────────────────────────────────────────────────────────

  const clearModel = useCallback(() => {
    setModel({})
    setModelIndex(0)
    setDatamodel(null)
    setJsonData([])
    setTable({})
    setSchema(deepClone(DefaultSchema))
    setTableChanges({})
    setMatchData([])
    setPasteItem({})
    setShowValues(true)
  }, [])

  // ── generate value ────────────────────────────────────────────────────────

  const generateUUID = useCallback(
    (pkVal, skVal, attrName) => {
      updateValue(pkVal, skVal, attrName, fakeUUID())
    },
    [updateValue],
  )

  const generateDate = useCallback(
    (pkVal, skVal, attrName) => {
      updateValue(pkVal, skVal, attrName, new Date().toISOString().split('.')[0])
    },
    [updateValue],
  )

  return {
    // state
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
    // actions
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
