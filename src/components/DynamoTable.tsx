import React, { useState } from 'react'
import { getValue, sortObjectList, type DynamoItem, type Schema } from '../modelUtils'
import { ContextMenu, type ContextMenuItem, type ContextMenuPosition } from './ContextMenu'
import './DynamoTable.css'

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface DynamoTableProps {
  jsonData: DynamoItem[]
  partitionKey: string
  sortKey: string
  sortKeyDatatype: string
  schema: Schema
  showValues: boolean
  isEditable: boolean
  pasteItem: DynamoItem
  onAddItem: (pkVal: string) => void
  onAddAttribute: (pkVal: string, skVal: string, attrName: string) => void
  onNameAttribute: (pkVal: string, skVal: string, oldName: string, newName: string) => void
  onUpdatePK: (oldPK: string, newPK: string) => void
  onUpdateValue: (pkVal: string, skVal: string, attrName: string, newVal: string) => void
  onDeletePartition: (pkVal: string) => void
  onDeleteItem: (pkVal: string, skVal: string) => void
  onDeleteAttribute: (pkVal: string, skVal: string, attrName: string) => void
  onCutItem: (pkVal: string, skVal: string) => void
  onCopyItem: (pkVal: string, skVal: string) => void
  onPasteItem: (pkVal: string) => void
  onMovePartition: (pkVal: string, direction: 'up' | 'down') => void
  onShowValueTemplate: (entityType: string, attrName: string) => void
  onGenerateUUID: (pkVal: string, skVal: string, attrName: string) => void
  onGenerateDate: (pkVal: string, skVal: string, attrName: string) => void
  onUndo: () => void
  onToggleSchema: () => void
}

export function DynamoTable({
  jsonData,
  partitionKey,
  sortKey,
  sortKeyDatatype,
  schema,
  showValues,
  isEditable,
  pasteItem,
  onAddItem,
  onAddAttribute,
  onNameAttribute,
  onUpdatePK,
  onUpdateValue,
  onDeletePartition,
  onDeleteItem,
  onDeleteAttribute,
  onCutItem,
  onCopyItem,
  onPasteItem,
  onMovePartition,
  onShowValueTemplate,
  onGenerateUUID,
  onGenerateDate,
  onUndo,
  onToggleSchema,
}: DynamoTableProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { sortedItems, uniqueValues } = sortObjectList(
    jsonData,
    partitionKey,
    sortKey,
    sortKeyDatatype,
  )

  let maxAttrs = 0
  for (const obj of jsonData) {
    const count = Object.keys(obj).filter((k) => k !== partitionKey && k !== sortKey).length
    if (count > maxAttrs) maxAttrs = count
  }

  function openContextMenu(e: React.MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function getEntityType(obj: DynamoItem): string | null {
    return obj['type'] ? getValue(obj['type']) : null
  }

  function getEntity(obj: DynamoItem) {
    const type = getEntityType(obj)
    return type && schema.models[type] ? schema.models[type] : null
  }

  // ── context menu builders ─────────────────────────────────────────────────

  function buildPKContextMenuItems(pkVal: string, obj: DynamoItem): ContextMenuItem[] {
    const pkList = uniqueValues[partitionKey] ?? []
    const isFirst = pkList[0] === pkVal
    const isLast = pkList[pkList.length - 1] === pkVal
    const hasPaste = Object.keys(pasteItem).length > 0

    return [
      { key: 'add', label: '➕ Add Item', onClick: () => onAddItem(pkVal) },
      { key: 'paste', label: '📋 Paste Item', disabled: !hasPaste, onClick: () => onPasteItem(pkVal) },
      { key: 'delete', label: '🗑 Delete Partition', onClick: () => onDeletePartition(pkVal) },
      {
        key: 'function',
        label: '🔧 Edit Value Template',
        onClick: () => {
          const type = getEntityType(obj)
          if (type) onShowValueTemplate(type, partitionKey)
        },
      },
      { key: 'sep1', separator: true },
      { key: 'up', label: '⬆ Move Up', disabled: isFirst, onClick: () => onMovePartition(pkVal, 'up') },
      { key: 'down', label: '⬇ Move Down', disabled: isLast, onClick: () => onMovePartition(pkVal, 'down') },
    ]
  }

  function buildSKContextMenuItems(pkVal: string, skVal: string, obj: DynamoItem): ContextMenuItem[] {
    const entity = getEntity(obj)
    const nonKeyAttrs = entity
      ? Object.keys(entity).filter((k) => k !== partitionKey && k !== sortKey && !Object.prototype.hasOwnProperty.call(obj, k))
      : []

    const addAttrSubmenu: ContextMenuItem[] = [
      ...nonKeyAttrs.map((k) => ({ key: k, label: k, onClick: () => onAddAttribute(pkVal, skVal, k) })),
      { key: 'new', label: 'New attribute…', onClick: () => onAddAttribute(pkVal, skVal, '~new~') },
    ]

    return [
      { key: 'addattr', label: '➕ Add Attribute', submenu: addAttrSubmenu },
      { key: 'cut', label: '✂ Cut Item', onClick: () => onCutItem(pkVal, skVal) },
      { key: 'copy', label: '📋 Copy Item', onClick: () => onCopyItem(pkVal, skVal) },
      { key: 'delete', label: '🗑 Delete Item', onClick: () => onDeleteItem(pkVal, skVal) },
      {
        key: 'function',
        label: '🔧 Edit Value Template',
        onClick: () => {
          const type = getEntityType(obj)
          if (type) onShowValueTemplate(type, sortKey)
        },
      },
      {
        key: 'insert',
        label: '🎲 Generate Value',
        submenu: [
          { key: 'uuid', label: 'UUID', onClick: () => onGenerateUUID(pkVal, skVal, sortKey) },
          { key: 'date', label: 'ISO8601 Date', onClick: () => onGenerateDate(pkVal, skVal, sortKey) },
        ],
      },
    ]
  }

  function buildAttrContextMenuItems(
    pkVal: string,
    skVal: string,
    attrName: string,
    obj: DynamoItem,
  ): ContextMenuItem[] {
    const isType = attrName === 'type'
    return [
      {
        key: 'delete',
        label: '🗑 Delete Attribute',
        disabled: isType,
        onClick: () => onDeleteAttribute(pkVal, skVal, attrName),
      },
      {
        key: 'function',
        label: '🔧 Edit Value Template',
        disabled: isType,
        onClick: () => {
          const type = getEntityType(obj)
          if (type) onShowValueTemplate(type, attrName)
        },
      },
      {
        key: 'insert',
        label: '🎲 Generate Value',
        submenu: [
          { key: 'uuid', label: 'UUID', onClick: () => onGenerateUUID(pkVal, skVal, attrName) },
          { key: 'date', label: 'ISO8601 Date', onClick: () => onGenerateDate(pkVal, skVal, attrName) },
        ],
      },
    ]
  }

  // ── row rendering ─────────────────────────────────────────────────────────

  const rows: React.ReactNode[] = []

  for (const group of sortedItems) {
    let pkRendered = false

    for (let rowIdx = 0; rowIdx < group.length; rowIdx++) {
      const obj = group[rowIdx]
      if (!Object.prototype.hasOwnProperty.call(obj, partitionKey)) continue
      if (sortKey && !Object.prototype.hasOwnProperty.call(obj, sortKey)) continue

      const pkVal = getValue(obj[partitionKey])
      const skVal = sortKey ? getValue(obj[sortKey]) : ''
      const entity = getEntity(obj)

      const attrNames = Object.keys(obj).filter((k) => k !== partitionKey && k !== sortKey)

      // ── PK cell ──────────────────────────────────────────────────────────
      let pkCell: React.ReactNode = null
      if (!pkRendered) {
        pkRendered = true
        const pkDisplay =
          !showValues && entity?.[partitionKey]
            ? (entity[partitionKey].value ?? entity[partitionKey].type ?? pkVal)
            : pkVal

        pkCell = (
          <td
            key={`pk-${pkVal}`}
            className="td-key pk-cell"
            rowSpan={group.length * 2}
          >
            {isEditable ? (
              <div
                className="key-cell-wrapper"
                onContextMenu={(e) => openContextMenu(e, buildPKContextMenuItems(pkVal, obj))}
              >
                <div
                  key={`pk-edit-${pkVal}-${pkDisplay}`}
                  className="editable-cell pk-context-menu"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newVal = e.currentTarget.textContent?.trim() ?? ''
                    if (newVal && newVal !== pkVal) onUpdatePK(pkVal, newVal)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                  }}
                >
                  {pkDisplay}
                </div>
                <div className="key-btn-row">
                  <button className="icon-btn" title="Delete Partition" onClick={() => onDeletePartition(pkVal)}>−</button>
                  <button className="icon-btn" title="Add Item" onClick={() => onAddItem(pkVal)}>+</button>
                </div>
              </div>
            ) : (
              <span>{pkDisplay}</span>
            )}
          </td>
        )
      }

      // ── SK cell ──────────────────────────────────────────────────────────
      let skCell: React.ReactNode = null
      if (sortKey) {
        const skDisplay =
          !showValues && entity?.[sortKey]
            ? (entity[sortKey].value ?? entity[sortKey].type ?? (skVal.startsWith('~new~') ? '~new~' : skVal))
            : skVal.startsWith('~new~') ? '~new~' : skVal

        skCell = (
          <td key={`sk-${pkVal}-${skVal}`} className="td-key sk-cell" rowSpan={2}>
            {isEditable ? (
              <div
                className="key-cell-wrapper"
                onContextMenu={(e) => openContextMenu(e, buildSKContextMenuItems(pkVal, skVal, obj))}
              >
                <div
                  key={`sk-edit-${pkVal}-${skVal}-${skDisplay}`}
                  className="editable-cell sk-context-menu"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newVal = e.currentTarget.textContent?.trim() ?? ''
                    if (newVal && newVal !== skVal) onUpdateValue(pkVal, skVal, sortKey, newVal)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                  }}
                >
                  {skDisplay}
                </div>
                <div className="key-btn-row">
                  <button className="icon-btn" title="Delete Item" onClick={() => onDeleteItem(pkVal, skVal)}>−</button>
                  <button className="icon-btn" title="Add Attribute" onClick={() => onAddAttribute(pkVal, skVal, '~new~')}>+</button>
                </div>
              </div>
            ) : (
              <span>{skDisplay}</span>
            )}
          </td>
        )
      }

      // ── Attribute cells ──────────────────────────────────────────────────
      const headerCells: React.ReactNode[] = []
      const valueCells: React.ReactNode[] = []

      for (const attrName of attrNames) {
        const value = obj[attrName]
        const valueType = value ? Object.keys(value)[0] : 'S'
        const isMap = valueType === 'M'
        const isNewAttr = attrName === '~new~'

        let displayVal = ''
        if (!showValues && entity?.[attrName]) {
          displayVal =
            attrName === 'type'
              ? getValue(value)
              : (entity[attrName].value ?? entity[attrName].type ?? getValue(value)) ?? ''
        } else {
          displayVal = getValue(value)
        }

        headerCells.push(
          <td key={`h-${attrName}`} className="grey-header">
            {isEditable && isNewAttr ? (
              <div
                className="editable-cell attribute-name-cell"
                contentEditable
                suppressContentEditableWarning
                autoFocus
                onBlur={(e) => {
                  const newName = e.currentTarget.textContent?.trim() ?? ''
                  if (newName && newName !== '~new~') onNameAttribute(pkVal, skVal, '~new~', newName)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                }}
              />
            ) : (
              attrName
            )}
          </td>,
        )

        valueCells.push(
          <td key={`v-${attrName}`}>
            {isMap ? (
              <span className="map-placeholder" title="Map type – nested display not supported">…</span>
            ) : isEditable ? (
              <div
                key={`v-edit-${pkVal}-${skVal}-${attrName}-${displayVal}`}
                className="editable-cell cell-context-menu"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newVal = e.currentTarget.textContent?.trim() ?? ''
                  if (newVal !== displayVal) onUpdateValue(pkVal, skVal, attrName, newVal)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                }}
                onContextMenu={(e) =>
                  openContextMenu(e, buildAttrContextMenuItems(pkVal, skVal, attrName, obj))
                }
              >
                {displayVal}
              </div>
            ) : (
              <span>{displayVal}</span>
            )}
          </td>,
        )
      }

      rows.push(
        <React.Fragment key={`row-${pkVal}-${skVal}`}>
          <tr>
            {rowIdx === 0 && pkCell}
            {skCell}
            {headerCells}
          </tr>
          <tr>{valueCells}</tr>
        </React.Fragment>,
      )
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="dynamo-table-wrapper">
      <table className="dynamo-table">
        <thead>
          <tr>
            <th colSpan={2} className="pk-header">
              <div className="pk-header-inner">
                Primary Key
                {isEditable && (
                  <button className="icon-btn float-right" title="Add Partition" onClick={() => onAddItem('')}>
                    +
                  </button>
                )}
              </div>
            </th>
            <th
              id="attrHead"
              rowSpan={2}
              colSpan={maxAttrs || 1}
              className="attr-header"
            >
              <div className="attr-header-inner">
                Attributes
                {isEditable && (
                  <span className="attr-header-controls">
                    <button className="icon-btn" title="Undo Change" onClick={onUndo}>↩</button>
                    <button
                      className="icon-btn schema-toggle"
                      title={showValues ? 'Show Schema' : 'Show Values'}
                      onClick={onToggleSchema}
                    >
                      {showValues ? '🔧' : '⚙'}
                    </button>
                  </span>
                )}
              </div>
            </th>
          </tr>
          <tr>
            <th className="key-cell">{partitionKey}</th>
            {sortKey && <th className="key-cell">{sortKey}</th>}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu as ContextMenuPosition}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
