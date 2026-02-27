import React, { useState } from 'react'
import { Modal } from './Modal'

// ── Confirm / Alert Modal ─────────────────────────────────────────────────────

export function AlertModal({ show, title, message, onOk, onCancel }) {
  return (
    <Modal show={show} title={title} onClose={onCancel}>
      <p style={{ textAlign: 'center' }}>{message}</p>
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={onOk}>OK</button>
      </div>
    </Modal>
  )
}

// ── Delete Attribute Modal ────────────────────────────────────────────────────

export function DeleteAttrModal({ show, onCancel, onThisItem, onAllItems }) {
  return (
    <Modal show={show} title="Delete Attribute" onClose={onCancel}>
      <p style={{ textAlign: 'center' }}>Apply to this Item only or all Items of this type?</p>
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={onThisItem}>This Item</button>
        <button className="btn-ok" onClick={onAllItems}>All Items</button>
      </div>
    </Modal>
  )
}

// ── Create Model Dialogue ─────────────────────────────────────────────────────

export function CreateModelModal({ show, onCancel, onNext }) {
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [desc, setDesc] = useState('')

  function handleOk() {
    if (!name.trim()) return
    onNext({ name, author, description: desc })
    setName(''); setAuthor(''); setDesc('')
  }

  return (
    <Modal show={show} title="Create Model" onClose={onCancel}>
      <label className="field-label">Name</label>
      <input className="field-input" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
      <label className="field-label">Author</label>
      <input className="field-input" value={author} onChange={e => setAuthor(e.target.value)} />
      <label className="field-label">Description</label>
      <input className="field-input" value={desc} onChange={e => setDesc(e.target.value)} />
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={handleOk}>OK</button>
      </div>
    </Modal>
  )
}

// ── Create Table / Index Dialogue ─────────────────────────────────────────────

export function CreateTableOrIndexModal({ show, isTable, onCancel, onCreate }) {
  const [pk, setPk] = useState('')
  const [sk, setSk] = useState('')
  const [pkType, setPkType] = useState('S')
  const [skType, setSkType] = useState('S')
  const [name, setName] = useState('')

  function handleCreate() {
    if (!pk.trim()) { alert('Please provide a partition key!'); return }
    if (!name.trim()) { alert('Please provide a name'); return }
    onCreate({ pk, sk, pkType, skType, name })
    setPk(''); setSk(''); setPkType('S'); setSkType('S'); setName('')
  }

  return (
    <Modal show={show} title={isTable ? 'Create Table' : 'Create Index'} onClose={onCancel}>
      <label className="field-label">Primary Key:</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="field-input"
          style={{ flex: 1 }}
          placeholder="Partition Key"
          value={pk}
          onChange={e => setPk(e.target.value)}
        />
        <select value={pkType} onChange={e => setPkType(e.target.value)}>
          <option value="S">String</option>
          <option value="N">Number</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="field-input"
          style={{ flex: 1 }}
          placeholder="Sort Key (optional)"
          value={sk}
          onChange={e => setSk(e.target.value)}
        />
        <select value={skType} onChange={e => setSkType(e.target.value)}>
          <option value="S">String</option>
          <option value="N">Number</option>
        </select>
      </div>
      <hr />
      <label className="field-label">{isTable ? 'Table name:' : 'Index name:'}</label>
      <input className="field-input" value={name} onChange={e => setName(e.target.value)} />
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={handleCreate}>Create</button>
      </div>
    </Modal>
  )
}

// ── Select Table Dialogue ─────────────────────────────────────────────────────

export function SelectTableModal({ show, tables, onCancel, onSelect }) {
  const [idx, setIdx] = useState('none')

  return (
    <Modal show={show} title="Change Table" onClose={onCancel}>
      <label className="field-label">Select a Table to view:</label>
      <select className="field-select" value={idx} onChange={e => setIdx(e.target.value)}>
        <option disabled value="none">-- none --</option>
        {tables.map((t, i) => (
          <option key={i} value={i}>{t.TableName}</option>
        ))}
        <option value="-1">Add new Table…</option>
      </select>
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="btn-ok"
          onClick={() => {
            if (idx === 'none') return
            onSelect(parseInt(idx))
          }}
        >OK</button>
      </div>
    </Modal>
  )
}

// ── Value Template Dialogue ───────────────────────────────────────────────────

export function ValueTemplateModal({ show, entityType, attrName, currentValue, onCancel, onSave }) {
  const [val, setVal] = useState(currentValue || '')

  React.useEffect(() => { setVal(currentValue || '') }, [currentValue])

  function handleSave() {
    if (val.includes('${' + attrName + '}')) {
      alert("Map Functions cannot reference the destination attribute.")
      return
    }
    onSave(val)
  }

  return (
    <Modal show={show} title="Edit Value Template" onClose={onCancel}>
      <label className="field-label">
        Value Template for '{entityType}.{attrName}':
      </label>
      <input
        className="field-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={`e.g. \${PK}#\${SK}`}
        autoFocus
      />
      <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        Reference other attributes with {'${attributeName}'}
      </p>
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={handleSave}>OK</button>
      </div>
    </Modal>
  )
}

// ── Import OneTable Dialogue ──────────────────────────────────────────────────

export function ImportOneTableModal({ show, onCancel, onImport }) {
  const [text, setText] = useState('')

  return (
    <Modal show={show} title="Import OneTable Schema" onClose={onCancel} width={560}>
      <label className="field-label">Paste OneTable Schema:</label>
      <textarea
        className="scroll-box"
        rows={14}
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      <div className="modal-buttons">
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-ok" onClick={() => { onImport(text); setText('') }}>Import</button>
      </div>
    </Modal>
  )
}

// ── Query Dialogue ────────────────────────────────────────────────────────────

export function QueryModal({ show, datamodel, table, onCancel, onRun }) {
  const [queryName, setQueryName] = useState('')
  const [selectedQuery, setSelectedQuery] = useState('none')
  const [view, setView] = useState('')
  const [pkVal, setPkVal] = useState('')
  const [skCondition, setSkCondition] = useState('')
  const [skVal, setSkVal] = useState('')
  const [skEndVal, setSkEndVal] = useState('')
  const [filters, setFilters] = useState([])
  const [showConditions, setShowConditions] = useState(false)
  const [showSK, setShowSK] = useState(false)
  const [defineNew, setDefineNew] = useState(false)

  const savedQueries = datamodel?.SavedQuery || {}
  const gsiList = datamodel?.GlobalSecondaryIndexes || []
  const tableOptions = table
    ? [{ label: table.name, value: table.name }, ...gsiList.map(g => ({ label: g.IndexName, value: g.IndexName }))]
    : []

  function handleSelectQuery(val) {
    setSelectedQuery(val)
    setShowConditions(true)
    if (val === 'new') {
      setDefineNew(true)
      setQueryName('')
      setPkVal(''); setSkCondition(''); setSkVal(''); setSkEndVal('')
      setFilters([])
      setShowSK(false)
    } else {
      setDefineNew(false)
      const q = savedQueries[val]
      if (!q) return
      setQueryName(val)
      setView(q.view)
      setPkVal(q.PK)
      if (q.SK) {
        setShowSK(true)
        setSkCondition(q.SK.condition)
        setSkVal(q.SK.values[0])
        setSkEndVal(q.SK.values[1] || '')
      } else {
        setShowSK(false)
      }
      setFilters(q.filter || [])
    }
  }

  function addFilter() {
    setFilters(f => [...f, { attribute: '', type: 'S', condition: '', values: [''] }])
  }

  function updateFilter(i, field, val) {
    setFilters(f => f.map((flt, idx) => idx === i ? { ...flt, [field]: val } : flt))
  }

  function handleRun() {
    const query = {
      name: defineNew ? queryName : selectedQuery,
      view: view || (table?.name || ''),
      PK: pkVal,
    }
    if (showSK && skCondition) {
      query.SK = { condition: skCondition, values: skCondition === 'between' ? [skVal, skEndVal] : [skVal] }
    }
    query.filter = filters.filter(f => f.attribute && f.condition)
    onRun(query)
  }

  function handleCancel() {
    setSelectedQuery('none'); setShowConditions(false); setDefineNew(false)
    setFilters([]); setShowSK(false)
    onCancel()
  }

  return (
    <Modal show={show} title="Run a Query" onClose={handleCancel} width={575}>
      <select className="field-select" value={selectedQuery} onChange={e => handleSelectQuery(e.target.value)}>
        <option disabled value="none">-- Select a Query --</option>
        {Object.keys(savedQueries).map(q => <option key={q} value={q}>{q}</option>)}
        <option value="new">Define new query…</option>
      </select>

      {showConditions && (
        <div style={{ marginTop: 12 }}>
          {defineNew && (
            <>
              <label className="field-label">Query Name:</label>
              <input className="field-input" value={queryName} onChange={e => setQueryName(e.target.value)} />
            </>
          )}

          <select className="field-select" value={view} onChange={e => setView(e.target.value)}>
            <option disabled value="">-- Select Table/Index --</option>
            {tableOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="field-label">Partition Key Value:</label>
          <input className="field-input" style={{ width: 200 }} value={pkVal} onChange={e => setPkVal(e.target.value)} />

          {showSK && (
            <div style={{ marginTop: 8 }}>
              <label className="field-label">Sort Key Condition:</label>
              <select value={skCondition} onChange={e => setSkCondition(e.target.value)}>
                <option disabled value="">-- Operation --</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&ge;</option>
                <option value="<=">&le;</option>
                <option value="=">=</option>
                <option value="begins">begins_with</option>
                <option value="between">between</option>
              </select>
              <input style={{ width: 150, marginLeft: 8 }} value={skVal} onChange={e => setSkVal(e.target.value)} />
              {skCondition === 'between' && (
                <input style={{ width: 150, marginLeft: 8 }} placeholder="End value" value={skEndVal} onChange={e => setSkEndVal(e.target.value)} />
              )}
            </div>
          )}

          {filters.map((f, i) => (
            <div key={i} style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, marginTop: 8 }}>
              {i > 0 && (
                <select value={f.operator || 'AND'} onChange={e => updateFilter(i, 'operator', e.target.value)}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <input placeholder="Attribute" value={f.attribute} onChange={e => updateFilter(i, 'attribute', e.target.value)} style={{ width: 140 }} />
                <select value={f.type} onChange={e => updateFilter(i, 'type', e.target.value)}>
                  <option value="S">String</option>
                  <option value="N">Number</option>
                  <option value="B">Boolean</option>
                </select>
                <select value={f.condition} onChange={e => updateFilter(i, 'condition', e.target.value)}>
                  <option disabled value="">-- Op --</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value=">=">&ge;</option>
                  <option value="<=">&le;</option>
                  <option value="=">=</option>
                  <option value="begins">begins_with</option>
                  <option value="between">between</option>
                  <option value="contains">contains</option>
                </select>
                <input placeholder="Value" value={f.values[0]} onChange={e => updateFilter(i, 'values', [e.target.value])} style={{ width: 140 }} />
                {f.condition === 'between' && (
                  <input placeholder="End value" value={f.values[1] || ''} onChange={e => updateFilter(i, 'values', [f.values[0], e.target.value])} style={{ width: 140 }} />
                )}
              </div>
            </div>
          ))}

          <div className="modal-buttons" style={{ marginTop: 8 }}>
            <button className="btn-ok" onClick={() => setShowSK(true)}>Add Sort Condition</button>
            <button className="btn-ok" onClick={addFilter}>Add Filter</button>
          </div>
        </div>
      )}

      <div className="modal-buttons">
        <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
        {showConditions && <button className="btn-ok" onClick={handleRun}>OK</button>}
      </div>
    </Modal>
  )
}
