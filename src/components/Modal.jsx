import React from 'react'
import './Modal.css'

export function Modal({ show, onClose, title, children, width = 500 }) {
  if (!show) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h1>{title}</h1>}
        {children}
      </div>
    </div>
  )
}
