import React, { useState, useRef, useCallback } from 'react'
import { getValue, sortObjectList, fakeUUID } from '../modelUtils'
import { ContextMenu } from './ContextMenu'
import './DynamoTable.css'

/**
 * Renders a single DynamoDB partition/sort-key table view.
 * Works for both the primary table (isEditable=true) and GSI views (isEditable=false).
 */
export function DynamoTable({
  jsonData,
  partitionKey,
  sortKey,
  sortKeyDatatype,
  schema,
  showValues,
  isEditable,
  pasteItem,
  // callbacks
  onAddItem,        // (pkVal) => void
  onAddAttribute,   // (pkVal, skVal, attrName) => void
  onNameAttribute,  // (pkVal, skVal, oldName, newName) => void
  onUpdatePK,       // (oldPK, newPK) => void
  onUpdateValue,    // (pkVal, skVal, attrName, newVal) => void
  onDeletePartition,// (pkVal) => void
  onDeleteItem,     // (pkVal, skVal) => void
  onDeleteAttribute,// (pkVal, skVal, attrName) => void  -- opens modal
  onCutItem,        // (pkVal, skVal) => void
  onCopyItem,       // (pkVal, skVal) => void
  onPasteItem,      // (pkVal) => void
  onMovePartition,  // (pkVal, 'up'|'down') => void
  onShowValueTemplate, // (entityType, attrName) => void
  onGenerateUUID,   // (pkVal, skVal, attrName) => void
  onGenerateDate,   // (pkVal, skVal, attrName) => void
  onUndo,
  onToggleSchema,
}) {
  const [contextMenu, setContextMenu] = useState(null) // { x, y, items }
  const [editingCell, setEditingCell] = useState(null)  // { pkVal, skVal, attr, value }
  const editRef = useRef({})

  const { sortedItems, uniqueValues } = sortObjectList(jsonData, partitionKey, sortKey, sortKeyDatatype)

  // Calculate max attribute columns
  let maxAttrs = 0
  for (const obj of jsonData) {
    const attrCount = Object.keys(obj).filter(k => k !== partitionKey && k !== sortKey).length
    if (attrCount > maxAttrs) maxAttrs = attrCount
  }

  function openContextMenu(e, items) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function getEntityType(obj) {
    return obj.type ? getValue(obj.type) : null
  }

  function getEntity(obj) {
    const type = getEntityType(obj)
    return type && schema.models[type] ? schema.models[type] : null
  }

  // ── editable cell helpers ────────────────────────────────────────────────

  function startEdit(key, value) {
    setEditingCell({ key, value })
    editRef.current[key] = value
  }

  function commitEdit(key, pkVal, skVal, attr, isNewAttrName = false) {
    const newVal = editRef.current[key]
    if (newVal === undefined || newVal === null) return
    setEditingCell(null)

    if (isNewAttrName) {
      onNameAttribute(pkVal, skVal, '~new~', newVal.trim())
    } else if (attr === partitionKey) {
      onUpdatePK(pkVal, newVal.trim())
    } else {
      onUpdateValue(pkVal, skVal, attr, newVal.trim())
    }
  }

  function buildPKContextMenuItems(pkVal, obj) {
    const pkList = uniqueValues[partitionKey] || []
    const isFirst = pkList[0] === pkVal
    const isLast = pkList[pkList.length - 1] === pkVal
    const hasPaste = Object.keys(pasteItem).length > 0

    return [
      { key: 'add', label: '➕ Add Item', onClick: () => onAddItem(pkVal) },
      {
        key: 'paste',
        label: '📋 Paste Item',
        disabled: !hasPaste,
        onClick: () => onPasteItem(pkVal),
      },
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

  function buildSKContextMenuItems(pkVal, skVal, obj) {
    const entity = getEntity(obj)
    const nonKeyAttrs = entity
      ? Object.keys(entity).filter(k => k !== partitionKey && k !== sortKey && !obj.hasOwnProperty(k))
      : []

    const addAttrSubmenu = [
      ...nonKeyAttrs.map(k => ({ key: k, label: k, onClick: () => onAddAttribute(pkVal, skVal, k) })),
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

  function buildAttrContextMenuItems(pkVal, skVal, attrName, obj) {
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

  // ── cell rendering ───────────────────────────────────────────────────────

  function EditableDiv({ cellKey, displayValue, onCommit, onContextMenu, className }) {
    const isEditing = editingCell?.key === cellKey

    return (
      <div
        className={`editable-cell ${className || ''}`}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onFocus={() => {
          if (!isEditing) startEdit(cellKey, displayValue)
        }}
        onBlur={(e) => {
          editRef.current[cellKey] = e.currentTarget.textContent
          onCommit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editRef.current[cellKey] = e.currentTarget.textContent
            e.currentTarget.blur()
          }
        }}
        onContextMenu={onContextMenu}
      >
        {displayValue}
      </div>
    )
  }

  // Render the table rows
  const rows = []
  for (const group of sortedItems) {
    let pkRendered = false
    for (let rowIdx = 0; rowIdx < group.length; rowIdx++) {
      const obj = group[rowIdx]
      if (!obj.hasOwnProperty(partitionKey)) continue
      if (sortKey && sortKey !== '' && !obj.hasOwnProperty(sortKey)) continue

      const pkVal = getValue(obj[partitionKey])
      const skVal = sortKey ? getValue(obj[sortKey]) : ''
      const entity = getEntity(obj)
      const entityType = getEntityType(obj)

      const attrNames = Object.keys(obj).filter(k => k !== partitionKey && k !== sortKey)

      // PK cell (only for first item in group)
      let pkCell = null
      if (!pkRendered) {
        pkRendered = true
        const pkDisplay = !showValues && entity && entity[partitionKey]
          ? (entity[partitionKey].value || entity[partitionKey].type || pkVal)
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
                  className="editable-cell pk-context-menu"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newVal = e.currentTarget.textContent.trim()
                    if (newVal !== pkVal) onUpdatePK(pkVal, newVal)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                  }}
                >
                  {pkDisplay}
                </div>
                <div className="key-btn-row">
                  <button
                    className="icon-btn"
                    title="Delete Partition"
                    onClick={() => onDeletePartition(pkVal)}
                  >−</button>
                  <button
                    className="icon-btn"
                    title="Add Item"
                    onClick={() => onAddItem(pkVal)}
                  >+</button>
                </div>
              </div>
            ) : (
              <span>{pkDisplay}</span>
            )}
          </td>
        )
      }

      // SK cell
      let skCell = null
      if (sortKey && sortKey !== '') {
        const skDisplay = !showValues && entity && entity[sortKey]
          ? (entity[sortKey].value || entity[sortKey].type || (skVal.startsWith('~new~') ? '~new~' : skVal))
          : (skVal.startsWith('~new~') ? '~new~' : skVal)

        skCell = (
          <td key={`sk-${pkVal}-${skVal}`} className="td-key sk-cell" rowSpan={2}>
            {isEditable ? (
              <div
                className="key-cell-wrapper"
                onContextMenu={(e) => openContextMenu(e, buildSKContextMenuItems(pkVal, skVal, obj))}
              >
                <div
                  className="editable-cell sk-context-menu"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newVal = e.currentTarget.textContent.trim()
                    if (newVal !== skVal) onUpdateValue(pkVal, skVal, sortKey, newVal)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                  }}
                >
                  {skDisplay}
                </div>
                <div className="key-btn-row">
                  <button
                    className="icon-btn"
                    title="Delete Item"
                    onClick={() => onDeleteItem(pkVal, skVal)}
                  >−</button>
                  <button
                    className="icon-btn"
                    title="Add Attribute"
                    onClick={() => onAddAttribute(pkVal, skVal, '~new~')}
                  >+</button>
                </div>
              </div>
            ) : (
              <span>{skDisplay}</span>
            )}
          </td>
        )
      }

      // Attribute header + value cells
      const headerCells = []
      const valueCells = []

      for (const attrName of attrNames) {
        const value = obj[attrName]
        const valueType = value ? Object.keys(value)[0] : 'S'
        const isMap = valueType === 'M'

        // Display value
        let displayVal = ''
        if (!showValues && entity && entity[attrName]) {
          displayVal = attrName === 'type'
            ? getValue(value)
            : (entity[attrName].value || entity[attrName].type || getValue(value))
        } else {
          displayVal = getValue(value)
        }

        const isNewAttr = attrName === '~new~'
        const cellKey = `attr-name-${pkVal}-${skVal}-${attrName}`

        headerCells.push(
          <td key={`h-${attrName}`} className="grey-header">
            {isEditable && isNewAttr ? (
              <div
                className="editable-cell attribute-name-cell"
                contentEditable
                suppressContentEditableWarning
                autoFocus
                onBlur={(e) => {
                  const newName = e.currentTarget.textContent.trim()
                  if (newName && newName !== '~new~') {
                    onNameAttribute(pkVal, skVal, '~new~', newName)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                }}
              />
            ) : attrName}
          </td>
        )

        valueCells.push(
          <td key={`v-${attrName}`}>
            {isMap ? (
              <span className="map-placeholder" title="Map type - nested display not supported">…</span>
            ) : isEditable ? (
              <div
                className="editable-cell cell-context-menu"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newVal = e.currentTarget.textContent.trim()
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
          </td>
        )
      }

      // Two rows per item: header row + value row
      rows.push(
        <React.Fragment key={`row-${pkVal}-${skVal}`}>
          <tr>
            {rowIdx === 0 && pkCell}
            {skCell}
            {headerCells}
          </tr>
          <tr>
            {valueCells}
          </tr>
        </React.Fragment>
      )
    }
  }

  return (
    <div className="dynamo-table-wrapper">
      <table className="dynamo-table">
        <thead>
          <tr>
            <th colSpan={2} className="pk-header">
              <div className="pk-header-inner">
                Primary Key
                {isEditable && (
                  <button
                    className="icon-btn float-right"
                    title="Add Partition"
                    onClick={() => onAddItem('')}
                  >+</button>
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
                    <button
                      className="icon-btn"
                      title="Undo Change"
                      onClick={onUndo}
                    >↩</button>
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
            {sortKey && sortKey !== '' && <th className="key-cell">{sortKey}</th>}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
