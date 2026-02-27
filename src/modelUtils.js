// Core data utilities – mirrors the logic in the original globals.js / function.js

export const DefaultSchema = {
  indexes: {},
  models: {},
  queries: {},
  data: [],
}

export const DYNAMO_TYPES = {
  String: 'S',
  Number: 'N',
  Binary: 'B',
  Boolean: 'BOOL',
  Null: 'NULL',
  Map: 'M',
  List: 'L',
  StringSet: 'SS',
  NumberSet: 'NS',
  BinarySet: 'BS',
}

/** Get the scalar value from a DynamoDB-typed attribute object like { S: "foo" } */
export function getValue(obj) {
  return obj ? obj[Object.keys(obj)[0]] : ''
}

/** Set the scalar value on a DynamoDB-typed attribute object in-place */
export function assignValue(obj, val) {
  obj[Object.keys(obj)[0]] = val
}

export function fakeUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function dynamoToType(dtype) {
  switch (dtype) {
    case 'B': return 'Binary'
    case 'BOOL': return 'Boolean'
    case 'S': return 'String'
    case 'N': return 'Number'
    case 'SS': return 'Set'
    default: return 'String'
  }
}

export function typeToDynamo(type) {
  switch (type) {
    case 'Binary': return 'B'
    case 'Boolean': return 'BOOL'
    case 'Date': return 'S'
    case 'Number': return 'N'
    case 'Set': return 'SS'
    default: return 'S'
  }
}

/** Deep-clone via JSON (same as original) */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/** Build schema from workbench model datamodel */
export function createSchema(datamodel) {
  const schema = deepClone(DefaultSchema)
  const keys = datamodel.KeyAttributes

  schema.indexes.primary = {
    hash: keys.PartitionKey.AttributeName,
    sort: keys.SortKey ? keys.SortKey.AttributeName : null,
  }

  for (const gsi of datamodel.GlobalSecondaryIndexes || []) {
    schema.indexes[gsi.IndexName] = {
      hash: gsi.KeyAttributes.PartitionKey.AttributeName,
      sort: gsi.KeyAttributes.SortKey ? gsi.KeyAttributes.SortKey.AttributeName : null,
      projection: gsi.Projection?.ProjectionType,
    }
  }

  for (const row of datamodel.TableData || []) {
    let entity = null
    if (row.type) {
      const type = Object.values(row.type)[0]
      if (!schema.models[type]) {
        schema.models[type] = {}
      }
      entity = schema.models[type]
    }
    for (const [fieldName, col] of Object.entries(row)) {
      if (entity) {
        if (!entity[fieldName]) {
          entity[fieldName] = {}
        }
        entity[fieldName].type = dynamoToType(Object.keys(col)[0])
      }
    }
  }

  // Apply value templates from KeyAttributes MapFunction
  const pkMapFn = keys.PartitionKey.MapFunction || {}
  for (const [type, fn] of Object.entries(pkMapFn)) {
    if (schema.models[type] && schema.models[type][keys.PartitionKey.AttributeName]) {
      schema.models[type][keys.PartitionKey.AttributeName].value = fn
    }
  }
  const skMapFn = (keys.SortKey && keys.SortKey.MapFunction) || {}
  for (const [type, fn] of Object.entries(skMapFn)) {
    if (schema.models[type] && schema.models[type][keys.SortKey.AttributeName]) {
      schema.models[type][keys.SortKey.AttributeName].value = fn
    }
  }
  for (const att of datamodel.NonKeyAttributes || []) {
    for (const [type, fn] of Object.entries(att.MapFunction || {})) {
      if (schema.models[type] && schema.models[type][att.AttributeName]) {
        schema.models[type][att.AttributeName].value = fn
      }
    }
  }

  return schema
}

/** Expand value templates in-place on tableData */
export function expandValueTemplates(tableData, schema) {
  for (const item of tableData) {
    for (const [name] of Object.entries(item)) {
      if (!item.type) continue
      const type = Object.values(item.type)[0]
      if (type === '~new~') continue

      const entity = schema.models[type]
      if (!entity) continue

      const field = entity[name]
      if (!field || !field.value) continue

      const text = field.value.replace(/\$\{(.*?)\}/g, (pattern, varName) => {
        return item[varName] ? Object.values(item[varName])[0] : pattern
      })
      const currentVal = Object.values(item[name])[0]
      if (text !== currentVal) {
        item[name] = { S: text }
      }
    }
  }
}

/** Group + sort items by partition key, then sort key */
export function sortObjectList(jsonData, partitionKey, sortKey, sortKeyDatatype) {
  const uniqueValues = {}

  for (const obj of jsonData) {
    for (const [name, propVal] of Object.entries(obj)) {
      if (!uniqueValues[name]) uniqueValues[name] = []
      const value = propVal[Object.keys(propVal)[0]]
      if (!uniqueValues[name].includes(value)) {
        uniqueValues[name].push(value)
      }
    }
  }

  const sortedItems = []
  const pkUniques = uniqueValues[partitionKey] || []

  for (const unique of pkUniques) {
    const newArr = []
    for (const obj of jsonData) {
      if (obj.hasOwnProperty(partitionKey) && unique === getValue(obj[partitionKey])) {
        if (!sortKey || sortKey === '' || obj.hasOwnProperty(sortKey)) {
          newArr.push(obj)
        }
      }
    }

    if (sortKey && sortKey !== '') {
      if (sortKeyDatatype === 'N') {
        newArr.sort((a, b) => (parseInt(a[sortKey]?.N) > parseInt(b[sortKey]?.N) ? 1 : -1))
      } else {
        try {
          newArr.sort((a, b) => (a[sortKey]?.S > b[sortKey]?.S ? 1 : -1))
        } catch {
          // no sort key on these items
        }
      }
    }
    sortedItems.push(newArr)
  }

  return { sortedItems, uniqueValues }
}

/** Get all unique attribute names across all items (for column width) */
export function getMaxAttributeCount(jsonData) {
  let max = 0
  for (const obj of jsonData) {
    if (Object.keys(obj).length > max) max = Object.keys(obj).length
  }
  return max
}

/** Add an entity type to the schema if it doesn't exist */
export function addEntityToSchema(obj, schema) {
  const type = getValue(obj.type)
  if (type && type !== '~new~' && !schema.models[type]) {
    schema.models[type] = {
      type: { type: 'String', required: true, value: type },
    }
    for (const key of Object.keys(obj)) {
      schema.models[type][key] = { type: 'String' }
    }
  }
}

/** Evaluate a single filter condition */
export function evaluate(item, test) {
  let value = ''
  switch (test.type) {
    case 'Boolean':
      value = getValue(item[test.attribute]) === 'true'
      break
    case 'N':
    case 'Number':
      value = parseFloat(getValue(item[test.attribute]))
      break
    default:
      value = getValue(item[test.attribute])
      break
  }

  switch (test.condition) {
    case '>': return value > test.values[0]
    case '>=': return value >= test.values[0]
    case '<': return value < test.values[0]
    case '<=': return value <= test.values[0]
    case '=': return value == test.values[0]
    case 'begins': return String(value).startsWith(test.values[0])
    case 'between': {
      let [start, end] = test.values
      if (start > end) [start, end] = [end, start]
      return value > start && value < end
    }
    case 'contains': return String(value).indexOf(test.values[0]) >= 0
    case 'in': return test.values.some((v) => value == v)
    default: return false
  }
}

/** Run a saved query against tableData */
export function runQuery(query, tableData, tableConfig, gsiList) {
  let PK = tableConfig.partition_key
  let SK = tableConfig.sort_key

  if (query.view !== tableConfig.name) {
    const gsi = gsiList.find((g) => g.IndexName === query.view)
    if (gsi) {
      PK = gsi.KeyAttributes.PartitionKey.AttributeName
      SK = gsi.KeyAttributes.SortKey?.AttributeName
    }
  }

  const matchData = []
  for (const item of tableData) {
    if (!item.hasOwnProperty(PK) || getValue(item[PK]) !== query.PK) continue

    let pass = true

    if (query.SK) {
      pass = evaluate(item, {
        type: tableConfig.sortkey_datatype,
        attribute: SK,
        values: query.SK.values,
        condition: query.SK.condition,
      })
    }

    if (pass) {
      for (const filter of query.filter || []) {
        if (filter.operator === 'OR') {
          if (pass) break
          else pass = true
        }
        if (pass) pass = evaluate(item, filter)
      }
    }

    if (pass) matchData.push(item)
  }
  return matchData
}

/** Import a OneTable schema JSON */
export function importOneTableSchema(text) {
  const schema = JSON.parse(text)
  if (!schema.models) throw new Error('Invalid OneTable schema. Missing top level models.')

  const newModel = {}
  let tableData = []
  let newDatamodel = null
  let newTable = null

  for (const [indexName, index] of Object.entries(schema.indexes)) {
    const def = {
      KeyAttributes: {
        PartitionKey: { AttributeName: index.hash, AttributeType: 'S' },
        SortKey: { AttributeName: index.sort, AttributeType: 'S' },
      },
      NonKeyAttributes: [],
      TableData: [],
    }

    if (!newModel.hasOwnProperty('DataModel')) {
      newModel.DataModel = []
      def.GlobalSecondaryIndexes = []
      def.TableName = indexName
      newModel.DataModel.push(def)
      newDatamodel = def
      tableData = def.TableData
      newTable = {
        name: indexName,
        partition_key: index.hash,
        sort_key: index.sort,
        sortkey_datatype: 'S',
      }
    } else {
      def.IndexName = indexName
      def.Projection = { ProjectionType: 'ALL' }
      newModel.DataModel[0].GlobalSecondaryIndexes.push(def)
    }
  }

  // Ensure type attr template exists per model
  for (const [modelName] of Object.entries(schema.models)) {
    if (!schema.models[modelName].type) {
      schema.models[modelName].type = { type: 'String', required: true, value: modelName }
    }
  }

  newDatamodel.ModelSchema = schema

  // Load data rows if present
  if (schema.data && schema.data.length > 0) {
    for (const row of schema.data) {
      const item = {}
      for (const [key, value] of Object.entries(row)) {
        item[key] = { S: value }
      }
      tableData.push(item)
    }
    expandValueTemplates(tableData, schema)
  } else {
    // Add one placeholder item
    const newItem = {}
    newItem[newTable.partition_key] = { S: '~new~' }
    if (newTable.sort_key) newItem[newTable.sort_key] = { S: '~new~' }
    newItem.type = { S: '~new~' }
    tableData.push(newItem)
  }

  return { model: newModel, datamodel: newDatamodel, schema, table: newTable, jsonData: tableData }
}

/** Export OneTable schema JSON */
export function exportOneTableSchema(schema, jsonData) {
  const output = { ...deepClone(schema), data: [] }
  for (const row of jsonData) {
    const item = {}
    for (const [key, value] of Object.entries(row)) {
      item[key] = Object.values(value)[0]
    }
    output.data.push(item)
  }
  return JSON.stringify(output, null, 4)
}

/** Trigger a browser file download */
export function saveFile(data, filename, type) {
  const file = new Blob([data], { type })
  const a = document.createElement('a')
  const url = URL.createObjectURL(file)
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
