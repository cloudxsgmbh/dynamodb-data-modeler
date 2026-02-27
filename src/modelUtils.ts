// ── DynamoDB attribute types ──────────────────────────────────────────────────

/** A single DynamoDB-typed attribute value, e.g. { S: "foo" } or { N: "42" } */
export type DynamoValue = Record<string, string | number | boolean>

/** A DynamoDB item: map of attribute name → typed value */
export type DynamoItem = Record<string, DynamoValue>

// ── Schema types ──────────────────────────────────────────────────────────────

export interface SchemaField {
  type?: string
  required?: boolean
  value?: string
  default?: string
}

export type SchemaModel = Record<string, SchemaField>

export interface SchemaIndex {
  hash: string
  sort: string | null
  projection?: string
}

export interface Schema {
  indexes: Record<string, SchemaIndex>
  models: Record<string, SchemaModel>
  queries: Record<string, SavedQuery>
  data: DynamoItem[]
}

// ── DynamoDB model types ──────────────────────────────────────────────────────

export interface KeyAttribute {
  AttributeName: string
  AttributeType: string
  MapFunction?: Record<string, string>
}

export interface KeyAttributes {
  PartitionKey: KeyAttribute
  SortKey?: KeyAttribute
}

export interface GSI {
  IndexName: string
  KeyAttributes: KeyAttributes
  Projection?: { ProjectionType: string }
}

export interface NonKeyAttribute {
  AttributeName: string
  AttributeType: string
  MapFunction?: Record<string, string>
}

export interface DataModel {
  TableName: string
  KeyAttributes: KeyAttributes
  NonKeyAttributes: NonKeyAttribute[]
  GlobalSecondaryIndexes: GSI[]
  TableData: DynamoItem[]
  ModelSchema?: Schema
  SavedQuery?: Record<string, SavedQuery>
}

export interface ModelMetadata {
  Author: string
  DateCreated: Date | string
  DateLastModified: Date | string
  Description: string
  AWSService: string
  Version: string
}

export interface Model {
  ModelName?: string
  ModelMetadata?: ModelMetadata
  DataModel: DataModel[]
  ModelSchema?: Schema
}

// ── Table config (runtime) ────────────────────────────────────────────────────

export interface TableConfig {
  name: string
  partition_key: string
  sort_key: string
  sortkey_datatype: string
}

// ── Query types ───────────────────────────────────────────────────────────────

export interface QueryFilter {
  operator?: 'AND' | 'OR'
  attribute: string
  type: string
  condition: string
  values: string[]
}

export interface SavedQuery {
  name?: string
  view: string
  PK: string
  SK?: { condition: string; values: string[] }
  filter?: QueryFilter[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DefaultSchema: Schema = {
  indexes: {},
  models: {},
  queries: {},
  data: [],
}

export const DYNAMO_TYPES: Record<string, string> = {
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

// ── Utility functions ─────────────────────────────────────────────────────────

/** Get the scalar value from a DynamoDB-typed attribute like { S: "foo" } */
export function getValue(obj: DynamoValue | undefined): string {
  return obj ? String(obj[Object.keys(obj)[0]]) : ''
}

/** Set the scalar value on a DynamoDB-typed attribute in-place */
export function assignValue(obj: DynamoValue, val: string): void {
  obj[Object.keys(obj)[0]] = val
}

export function fakeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function dynamoToType(dtype: string): string {
  switch (dtype) {
    case 'B': return 'Binary'
    case 'BOOL': return 'Boolean'
    case 'S': return 'String'
    case 'N': return 'Number'
    case 'SS': return 'Set'
    default: return 'String'
  }
}

export function typeToDynamo(type: string): string {
  switch (type) {
    case 'Binary': return 'B'
    case 'Boolean': return 'BOOL'
    case 'Date': return 'S'
    case 'Number': return 'N'
    case 'Set': return 'SS'
    default: return 'S'
  }
}

/** Deep-clone via JSON */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/** Build a Schema from a workbench DataModel */
export function createSchema(datamodel: DataModel): Schema {
  const schema = deepClone(DefaultSchema)
  const keys = datamodel.KeyAttributes

  schema.indexes['primary'] = {
    hash: keys.PartitionKey.AttributeName,
    sort: keys.SortKey ? keys.SortKey.AttributeName : null,
  }

  for (const gsi of datamodel.GlobalSecondaryIndexes ?? []) {
    schema.indexes[gsi.IndexName] = {
      hash: gsi.KeyAttributes.PartitionKey.AttributeName,
      sort: gsi.KeyAttributes.SortKey ? gsi.KeyAttributes.SortKey.AttributeName : null,
      projection: gsi.Projection?.ProjectionType,
    }
  }

  for (const row of datamodel.TableData ?? []) {
    let entity: SchemaModel | null = null
    if (row['type']) {
      const type = String(Object.values(row['type'])[0])
      if (!schema.models[type]) schema.models[type] = {}
      entity = schema.models[type]
    }
    for (const [fieldName, col] of Object.entries(row)) {
      if (entity) {
        if (!entity[fieldName]) entity[fieldName] = {}
        entity[fieldName].type = dynamoToType(Object.keys(col)[0])
      }
    }
  }

  // Apply value templates from MapFunction entries
  const pkMapFn: Record<string, string> = keys.PartitionKey.MapFunction ?? {}
  for (const [type, fn] of Object.entries(pkMapFn)) {
    const m = schema.models[type]
    if (m?.[keys.PartitionKey.AttributeName]) {
      m[keys.PartitionKey.AttributeName].value = fn
    }
  }
  const skMapFn: Record<string, string> = keys.SortKey?.MapFunction ?? {}
  for (const [type, fn] of Object.entries(skMapFn)) {
    const skName = keys.SortKey!.AttributeName
    const m = schema.models[type]
    if (m?.[skName]) m[skName].value = fn
  }
  for (const att of datamodel.NonKeyAttributes ?? []) {
    for (const [type, fn] of Object.entries(att.MapFunction ?? {})) {
      const m = schema.models[type]
      if (m?.[att.AttributeName]) m[att.AttributeName].value = fn
    }
  }

  return schema
}

/** Expand value templates in-place on tableData */
export function expandValueTemplates(tableData: DynamoItem[], schema: Schema): void {
  for (const item of tableData) {
    for (const name of Object.keys(item)) {
      if (!item['type']) continue
      const type = String(Object.values(item['type'])[0])
      if (type === '~new~') continue

      const entity = schema.models[type]
      if (!entity) continue

      const field = entity[name]
      if (!field?.value) continue

      const text = field.value.replace(/\$\{(.*?)\}/g, (_pattern, varName: string) => {
        return item[varName] ? String(Object.values(item[varName])[0]) : _pattern
      })
      const currentVal = String(Object.values(item[name])[0])
      if (text !== currentVal) {
        item[name] = { S: text }
      }
    }
  }
}

export interface SortedObjectListResult {
  sortedItems: DynamoItem[][]
  uniqueValues: Record<string, string[]>
}

/** Group + sort items by partition key, then sort key */
export function sortObjectList(
  jsonData: DynamoItem[],
  partitionKey: string,
  sortKey: string,
  sortKeyDatatype: string,
): SortedObjectListResult {
  const uniqueValues: Record<string, string[]> = {}

  for (const obj of jsonData) {
    for (const [name, propVal] of Object.entries(obj)) {
      if (!uniqueValues[name]) uniqueValues[name] = []
      const value = String(propVal[Object.keys(propVal)[0]])
      if (!uniqueValues[name].includes(value)) uniqueValues[name].push(value)
    }
  }

  const sortedItems: DynamoItem[][] = []
  const pkUniques = uniqueValues[partitionKey] ?? []

  for (const unique of pkUniques) {
    const group = jsonData.filter(
      (obj) =>
        Object.prototype.hasOwnProperty.call(obj, partitionKey) &&
        unique === getValue(obj[partitionKey]) &&
        (!sortKey || sortKey === '' || Object.prototype.hasOwnProperty.call(obj, sortKey)),
    )

    if (sortKey && sortKey !== '') {
      if (sortKeyDatatype === 'N') {
        group.sort((a, b) =>
          parseInt(String(a[sortKey]?.['N'] ?? 0)) > parseInt(String(b[sortKey]?.['N'] ?? 0))
            ? 1
            : -1,
        )
      } else {
        try {
          group.sort((a, b) => (String(a[sortKey]?.['S'] ?? '') > String(b[sortKey]?.['S'] ?? '') ? 1 : -1))
        } catch {
          // no sort key on these items
        }
      }
    }
    sortedItems.push(group)
  }

  return { sortedItems, uniqueValues }
}

/** Add an entity type to the schema if it doesn't exist */
export function addEntityToSchema(obj: DynamoItem, schema: Schema): void {
  const type = getValue(obj['type'])
  if (type && type !== '~new~' && !schema.models[type]) {
    schema.models[type] = {
      type: { type: 'String', required: true, value: type },
    }
    for (const key of Object.keys(obj)) {
      schema.models[type][key] = { type: 'String' }
    }
  }
}

/** Evaluate a single filter condition against an item */
export function evaluate(item: DynamoItem, test: QueryFilter): boolean {
  let value: string | number | boolean = ''
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
  }

  switch (test.condition) {
    case '>':       return value > test.values[0]
    case '>=':      return value >= test.values[0]
    case '<':       return value < test.values[0]
    case '<=':      return value <= test.values[0]
    case '=':       return value == test.values[0]  // intentional ==
    case 'begins':  return String(value).startsWith(test.values[0])
    case 'between': {
      let [start, end] = test.values
      if (start > end) [start, end] = [end, start]
      return value > start && value < end
    }
    case 'contains': return String(value).includes(test.values[0])
    case 'in':       return test.values.some((v) => value == v)
    default:         return false
  }
}

/** Run a saved query and return matching items */
export function runQuery(
  query: SavedQuery,
  tableData: DynamoItem[],
  tableConfig: TableConfig,
  gsiList: GSI[],
): DynamoItem[] {
  let PK = tableConfig.partition_key
  let SK: string | undefined = tableConfig.sort_key

  if (query.view !== tableConfig.name) {
    const gsi = gsiList.find((g) => g.IndexName === query.view)
    if (gsi) {
      PK = gsi.KeyAttributes.PartitionKey.AttributeName
      SK = gsi.KeyAttributes.SortKey?.AttributeName
    }
  }

  const matchData: DynamoItem[] = []
  for (const item of tableData) {
    if (!Object.prototype.hasOwnProperty.call(item, PK) || getValue(item[PK]) !== query.PK) continue

    let pass = true

    if (query.SK && SK) {
      pass = evaluate(item, {
        attribute: SK,
        type: tableConfig.sortkey_datatype,
        condition: query.SK.condition,
        values: query.SK.values,
      })
    }

    if (pass) {
      for (const filter of query.filter ?? []) {
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

// ── OneTable import / export ──────────────────────────────────────────────────

export interface ImportOneTableResult {
  model: Model
  datamodel: DataModel
  schema: Schema
  table: TableConfig
  jsonData: DynamoItem[]
}

/** Import a OneTable schema JSON string */
export function importOneTableSchema(text: string): ImportOneTableResult {
  const schema = JSON.parse(text) as Schema
  if (!schema.models) throw new Error('Invalid OneTable schema. Missing top level models.')

  const newModel: Model = { DataModel: [] }
  let tableData: DynamoItem[] = []
  let newDatamodel: DataModel | null = null
  let newTable: TableConfig | null = null

  for (const [indexName, index] of Object.entries(schema.indexes)) {
    const def: DataModel = {
      TableName: '',
      KeyAttributes: {
        PartitionKey: { AttributeName: index.hash, AttributeType: 'S' },
        SortKey: index.sort ? { AttributeName: index.sort, AttributeType: 'S' } : undefined,
      },
      NonKeyAttributes: [],
      GlobalSecondaryIndexes: [],
      TableData: [],
    }

    if (newModel.DataModel.length === 0) {
      def.TableName = indexName
      newModel.DataModel.push(def)
      newDatamodel = def
      tableData = def.TableData
      newTable = {
        name: indexName,
        partition_key: index.hash,
        sort_key: index.sort ?? '',
        sortkey_datatype: 'S',
      }
    } else {
      // Additional indexes become GSIs on the primary table
      const gsi: GSI = {
        IndexName: indexName,
        KeyAttributes: def.KeyAttributes,
        Projection: { ProjectionType: 'ALL' },
      }
      newModel.DataModel[0].GlobalSecondaryIndexes.push(gsi)
    }
  }

  // Ensure type attribute template per model
  for (const modelName of Object.keys(schema.models)) {
    if (!schema.models[modelName]['type']) {
      schema.models[modelName]['type'] = { type: 'String', required: true, value: modelName }
    }
  }

  newDatamodel!.ModelSchema = schema

  if (schema.data && schema.data.length > 0) {
    for (const row of schema.data) {
      const item: DynamoItem = {}
      for (const [key, value] of Object.entries(row)) {
        item[key] = { S: String(value) }
      }
      tableData.push(item)
    }
    expandValueTemplates(tableData, schema)
  } else {
    const placeholder: DynamoItem = {}
    placeholder[newTable!.partition_key] = { S: '~new~' }
    if (newTable!.sort_key) placeholder[newTable!.sort_key] = { S: '~new~' }
    placeholder['type'] = { S: '~new~' }
    tableData.push(placeholder)
  }

  return {
    model: newModel,
    datamodel: newDatamodel!,
    schema,
    table: newTable!,
    jsonData: tableData,
  }
}

/** Export current data as a OneTable schema JSON string */
export function exportOneTableSchema(schema: Schema, jsonData: DynamoItem[]): string {
  const output = { ...deepClone(schema), data: [] as Record<string, string>[] }
  for (const row of jsonData) {
    const item: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      item[key] = String(Object.values(value)[0])
    }
    output.data.push(item)
  }
  return JSON.stringify(output, null, 4)
}

/** Trigger a browser file download */
export function saveFile(data: string, filename: string, type: string): void {
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
