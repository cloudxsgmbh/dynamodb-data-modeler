import React, { useState, useRef } from 'react'
import { useModelState } from './useModelState'
import { DynamoTable } from './components/DynamoTable'
import {
  AlertModal,
  DeleteAttrModal,
  CreateModelModal,
  CreateTableOrIndexModal,
  SelectTableModal,
  ValueTemplateModal,
  ImportOneTableModal,
  QueryModal,
} from './components/Dialogs'
import type { SavedQuery } from './modelUtils'
import './App.css'

export default function App() {
  const state = useModelState()

  // ── UI dialog state ────────────────────────────────────────────────────────
  const [sidenavOpen, setSidenavOpen] = useState(false)
  const [showAbout, setShowAbout] = useState(true)
  const [activeTab, setActiveTab] = useState('primary') // 'primary' | gsi index name

  // Modal visibility
  const [showCreateModel, setShowCreateModel] = useState(false)
  const [showCreateTable, setShowCreateTable] = useState(false)
  const [showCreateIndex, setShowCreateIndex] = useState(false)
  const [showSelectTable, setShowSelectTable] = useState(false)
  const [showImportOneTable, setShowImportOneTable] = useState(false)
  const [showQuery, setShowQuery] = useState(false)
  const [showValueTemplate, setShowValueTemplate] = useState(false)
  const [showDeleteAttr, setShowDeleteAttr] = useState(false)
  interface ConfirmModal {
    title: string
    message: string
    onOk: () => void
    onCancel: () => void
  }
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)

  interface ModelMeta { name: string; author: string; description: string }
  interface DeleteAttrPending { pkVal: string; skVal: string; attrName: string }
  interface ValueTemplateMeta { entityType: string; attrName: string; currentValue: string }

  // Pending data for modals that need context
  const [pendingModelMeta, setPendingModelMeta] = useState<ModelMeta | null>(null)
  const [pendingDeleteAttr, setPendingDeleteAttr] = useState<DeleteAttrPending | null>(null)
  const [valueTemplateMeta, setValueTemplateMeta] = useState<ValueTemplateMeta>({ entityType: '', attrName: '', currentValue: '' })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasModel = state.datamodel != null
  const gsiList = state.datamodel?.GlobalSecondaryIndexes || []

  // ── after model loads, hide about and go to primary tab ───────────────────
  function afterLoad() {
    setShowAbout(false)
    setActiveTab('primary')
  }

  // ── sidenav handlers ───────────────────────────────────────────────────────
  function handleCreateModel() {
    setSidenavOpen(false)
    if (state.model?.ModelName) {
      setConfirmModal({
        title: 'Model Overwrite',
        message: 'The existing model will be overwritten, continue?',
        onOk: () => { setConfirmModal(null); setShowCreateModel(true) },
        onCancel: () => setConfirmModal(null),
      })
    } else {
      setShowCreateModel(true)
    }
  }

  function handleClearModel() {
    setSidenavOpen(false)
    state.clearModel()
    setShowAbout(true)
    setActiveTab('primary')
  }

  function handleLoadFromFile() {
    setSidenavOpen(false)
    fileInputRef.current?.click()
  }

  function handleSaveToFile() {
    setSidenavOpen(false)
    state.saveModel()
  }

  function handleImportOneTable() {
    setSidenavOpen(false)
    setShowImportOneTable(true)
  }

  function handleExportOneTable() {
    setSidenavOpen(false)
    state.exportOneTable()
  }

  // ── file input ─────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        state.loadModelFromFile(evt.target?.result as string)
        afterLoad()
      } catch (err) {
        alert('Failed to load model: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── create model flow ──────────────────────────────────────────────────────
  function handleCreateModelNext(meta: ModelMeta) {
    setShowCreateModel(false)
    setPendingModelMeta(meta)
    setShowCreateTable(true)
  }

  function handleCreateTableConfirm({ pk, sk, pkType, skType, name }: { pk: string; sk: string; pkType: string; skType: string; name: string }) {
    setShowCreateTable(false)
    if (pendingModelMeta) {
      state.createModel(pendingModelMeta, pk, sk, pkType, skType, name)
      setPendingModelMeta(null)
    } else {
      state.addNewTable(name, pk, sk, pkType, skType)
    }
    afterLoad()
  }

  function handleCreateIndexConfirm({ pk, sk, pkType, skType, name }: { pk: string; sk: string; pkType: string; skType: string; name: string }) {
    setShowCreateIndex(false)
    state.addGSI(name, pk, sk, pkType, skType)
    afterLoad()
  }

  // ── table switching ────────────────────────────────────────────────────────
  function handleSelectTable(idx: number) {
    setShowSelectTable(false)
    if (idx === -1) {
      setShowCreateTable(true) // add new table
    } else {
      state.switchTable(idx)
      afterLoad()
    }
  }

  // ── value template ─────────────────────────────────────────────────────────
  function openValueTemplate(entityType: string, attrName: string) {
    const currentValue = state.schema.models[entityType]?.[attrName]?.value || ''
    setValueTemplateMeta({ entityType, attrName, currentValue })
    setShowValueTemplate(true)
  }

  function handleSaveValueTemplate(templateValue: string) {
    state.setValueTemplate(valueTemplateMeta.entityType, valueTemplateMeta.attrName, templateValue)
    setShowValueTemplate(false)
  }

  // ── delete attribute ───────────────────────────────────────────────────────
  function openDeleteAttr(pkVal: string, skVal: string, attrName: string) {
    setPendingDeleteAttr({ pkVal, skVal, attrName })
    setShowDeleteAttr(true)
  }

  function handleDeleteAttrThisItem() {
    if (!pendingDeleteAttr) return
    const { pkVal, skVal, attrName } = pendingDeleteAttr
    state.deleteAttribute(pkVal, skVal, attrName, false)
    setShowDeleteAttr(false)
  }

  function handleDeleteAttrAllItems() {
    if (!pendingDeleteAttr) return
    const { pkVal, skVal, attrName } = pendingDeleteAttr
    state.deleteAttribute(pkVal, skVal, attrName, true)
    setShowDeleteAttr(false)
  }

  // ── query ──────────────────────────────────────────────────────────────────
  function handleRunQuery(queryObj: SavedQuery) {
    state.applyQuery(queryObj)
    setShowQuery(false)
    afterLoad()
  }

  // ── current GSI for active tab ─────────────────────────────────────────────
  const activeGSI = activeTab !== 'primary'
    ? gsiList.find(g => g.IndexName === activeTab)
    : null

  const displayData = state.matchData.length > 0 ? state.matchData : state.jsonData

  // ── determine GSI display data (re-sort from full tableData) ───────────────
  function getGSIData(_gsi: unknown) {
    return state.datamodel?.TableData ?? []
  }

  // ── tab rendering ──────────────────────────────────────────────────────────
  function renderTable() {
    if (!hasModel) return null

    const sharedProps = {
      schema: state.schema,
      showValues: state.showValues,
      pasteItem: state.pasteItem,
      onAddAttribute: state.addAttribute,
      onNameAttribute: state.nameAttribute,
      onDeletePartition: (pkVal: string) => {
        setConfirmModal({
          title: 'Delete Partition',
          message: `All items in the '${pkVal}' partition will be deleted, continue?`,
          onOk: () => { setConfirmModal(null); state.deletePartition(pkVal) },
          onCancel: () => setConfirmModal(null),
        })
      },
      onDeleteItem: (pkVal: string, skVal: string) => {
        if (pkVal === '~new~') { alert('Items cannot be deleted from new partitions.'); return }
        if (skVal === '~new~') { alert('New Items cannot be deleted.'); return }
        setConfirmModal({
          title: 'Delete Item',
          message: `Item key '${pkVal}, ${skVal}' will be deleted, continue?`,
          onOk: () => { setConfirmModal(null); state.deleteItem(pkVal, skVal) },
          onCancel: () => setConfirmModal(null),
        })
      },
      onDeleteAttribute: openDeleteAttr,
      onCutItem: state.cutItem,
      onCopyItem: state.copyItem,
      onPasteItem: state.pasteItemToPartition,
      onMovePartition: state.movePartition,
      onShowValueTemplate: openValueTemplate,
      onGenerateUUID: state.generateUUID,
      onGenerateDate: state.generateDate,
      onUndo: state.undoChange,
      onToggleSchema: state.toggleSchema,
    }

    if (activeTab === 'primary') {
      return (
        <DynamoTable
          jsonData={displayData}
          partitionKey={state.table.partition_key}
          sortKey={state.table.sort_key}
          sortKeyDatatype={state.table.sortkey_datatype}
          isEditable
          onAddItem={state.addItem}
          onUpdatePK={state.updatePK}
          onUpdateValue={state.updateValue}
          {...sharedProps}
        />
      )
    } else if (activeGSI) {
      const pk = activeGSI.KeyAttributes.PartitionKey.AttributeName
      const sk = activeGSI.KeyAttributes.SortKey?.AttributeName || ''
      const skt = activeGSI.KeyAttributes.SortKey?.AttributeType || 'S'
      // Filter full table data for items that have this GSI's keys
      const gsiData = getGSIData(activeGSI).filter(
        item => item.hasOwnProperty(pk)
      )
      return (
        <DynamoTable
          jsonData={gsiData}
          partitionKey={pk}
          sortKey={sk}
          sortKeyDatatype={skt}
          isEditable={false}
          onAddItem={() => {}}
          onUpdatePK={() => {}}
          onUpdateValue={() => {}}
          {...sharedProps}
        />
      )
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo-title">
          <span className="dynamo-icon">⚡</span>
          <h1 className="app-title">Amazon DynamoDB Data Modeler</h1>
        </div>
        <button className="menu-btn" onClick={() => setSidenavOpen(true)}>☰ menu</button>
      </header>

      {/* Side nav */}
      <div className={`sidenav ${sidenavOpen ? 'open' : ''}`}>
        <button className="closebtn" onClick={() => setSidenavOpen(false)}>×</button>
        <nav>
          <a href="#" onClick={e => { e.preventDefault(); handleCreateModel() }}>Create Model</a>
          <a href="#" onClick={e => { e.preventDefault(); handleClearModel() }}>Clear Model</a>
          <a href="#" onClick={e => { e.preventDefault(); handleLoadFromFile() }}>Load from File</a>
          <a href="#" onClick={e => { e.preventDefault(); handleSaveToFile() }}>Save to File</a>
          <a href="#" onClick={e => { e.preventDefault(); handleImportOneTable() }}>Import OneTable</a>
          <a href="#" onClick={e => { e.preventDefault(); handleExportOneTable() }}>Export OneTable</a>
        </nav>
      </div>
      {sidenavOpen && <div className="sidenav-backdrop" onClick={() => setSidenavOpen(false)} />}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        accept=".json"
        onChange={handleFileChange}
      />

      {/* Main content */}
      <main className="main">
        {showAbout && !hasModel && <AboutSection />}

        {hasModel && (
          <div className="table-area">
            {/* Tab bar */}
            <div className="tab-bar">
              {/* Primary table tab */}
              <button
                className={`tab-btn ${activeTab === 'primary' ? 'active' : ''}`}
                onClick={() => setActiveTab('primary')}
              >
                <span className="tab-title">{state.table.name}</span>
                <span className="tab-controls">
                  <button
                    className="tab-icon-btn"
                    title="Add Index"
                    onClick={e => { e.stopPropagation(); setShowCreateIndex(true) }}
                  >+</button>
                  <button
                    className="tab-icon-btn"
                    title="Switch Table"
                    onClick={e => { e.stopPropagation(); setShowSelectTable(true) }}
                  >⇄</button>
                  <button
                    className="tab-icon-btn"
                    title="Run Query"
                    onClick={e => { e.stopPropagation(); setShowQuery(true) }}
                  >🔍</button>
                </span>
              </button>

              {/* GSI tabs */}
              {gsiList.map(gsi => (
                <button
                  key={gsi.IndexName}
                  className={`tab-btn ${activeTab === gsi.IndexName ? 'active' : ''}`}
                  onClick={() => setActiveTab(gsi.IndexName)}
                >
                  {gsi.IndexName}
                </button>
              ))}
            </div>

            {/* Query active banner */}
            {state.matchData.length > 0 && (
              <div className="query-banner">
                Showing {state.matchData.length} matching items from query.{' '}
                <button className="link-btn" onClick={() => { state.clearQuery(); afterLoad() }}>Clear</button>
              </div>
            )}

            {/* Table */}
            <div className="table-container">
              {renderTable()}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {confirmModal && (
        <AlertModal
          show
          title={confirmModal.title}
          message={confirmModal.message}
          onOk={confirmModal.onOk}
          onCancel={confirmModal.onCancel}
        />
      )}

      <DeleteAttrModal
        show={showDeleteAttr}
        onCancel={() => setShowDeleteAttr(false)}
        onThisItem={handleDeleteAttrThisItem}
        onAllItems={handleDeleteAttrAllItems}
      />

      <CreateModelModal
        show={showCreateModel}
        onCancel={() => setShowCreateModel(false)}
        onNext={handleCreateModelNext}
      />

      <CreateTableOrIndexModal
        show={showCreateTable}
        isTable
        onCancel={() => setShowCreateTable(false)}
        onCreate={handleCreateTableConfirm}
      />

      <CreateTableOrIndexModal
        show={showCreateIndex}
        isTable={false}
        onCancel={() => setShowCreateIndex(false)}
        onCreate={handleCreateIndexConfirm}
      />

      <SelectTableModal
        show={showSelectTable}
        tables={state.model?.DataModel || []}
        onCancel={() => setShowSelectTable(false)}
        onSelect={handleSelectTable}
      />

      <ValueTemplateModal
        show={showValueTemplate}
        entityType={valueTemplateMeta.entityType}
        attrName={valueTemplateMeta.attrName}
        currentValue={valueTemplateMeta.currentValue}
        onCancel={() => setShowValueTemplate(false)}
        onSave={handleSaveValueTemplate}
      />

      <ImportOneTableModal
        show={showImportOneTable}
        onCancel={() => setShowImportOneTable(false)}
        onImport={(text) => {
          try {
            state.importOneTable(text)
            setShowImportOneTable(false)
            afterLoad()
          } catch (err) {
            alert('Import failed: ' + (err as Error).message)
          }
        }}
      />

      <QueryModal
        show={showQuery}
        datamodel={state.datamodel}
        table={state.table}
        onCancel={() => setShowQuery(false)}
        onRun={handleRunQuery}
      />
    </div>
  )
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <div className="about-section">
      <h3>Introduction</h3>
      <p>
        Welcome to the DynamoDB Data Modeler. This utility creates a data model with one or more
        virtual Tables, allowing users to visualize how relational data might be stored and indexed
        in DynamoDB in order to help design efficient schema for your application. The tool is fully
        compatible with the NoSQL Workbench for DynamoDB, and models generated by either tool are
        interchangeable.
      </p>
      <p>
        The data displayed by the DynamoDB Data Modeler is stored locally in memory as a collection
        of virtual Tables. Unlike other tools for visualizing data, the DynamoDB Data Modeler is
        designed specifically to model NoSQL data and does not assume that the items being displayed
        are homogenous in nature.
      </p>

      <h3>Getting Started</h3>
      <p>
        To get started with a new model, select <strong>Create Model</strong> from the{' '}
        <strong>☰ menu</strong>. To import an existing model use the <strong>Load from File</strong>{' '}
        option. You can also import an existing OneTable schema using{' '}
        <strong>Import OneTable</strong>.
      </p>

      <h3>Table Controls</h3>
      <ul>
        <li>
          <strong>+</strong> in the Primary Key header → add new partition / item / attribute
        </li>
        <li>
          <strong>−</strong> in a Partition Key cell → delete partition; in Sort Key cell → delete item
        </li>
        <li>Right-click any cell for the full context menu</li>
        <li>
          <strong>↩</strong> button → undo last change (up to 50 per table)
        </li>
        <li>
          <strong>🔧 / ⚙</strong> → toggle between Data view and Schema view
        </li>
      </ul>

      <h3>Item Types</h3>
      <p>
        All Items have a <code>type</code> attribute. The modeler maintains an attribute template
        for each unique Item type and propagates attribute changes to all items of the same type.
      </p>

      <h3>Value Templates</h3>
      <p>
        Attributes can be assigned value templates to generate composite values. Reference other
        attributes with <code>{'${attributeName}'}</code>. Example:{' '}
        <code>{'${timestamp}#${treatmentId}'}</code>
      </p>

      <h3>OneTable Integration</h3>
      <p>
        Import and export your{' '}
        <a href="https://github.com/sensedeep/dynamodb-onetable" target="_blank" rel="noreferrer">
          OneTable
        </a>{' '}
        schema files using the menu options.
      </p>
    </div>
  )
}
