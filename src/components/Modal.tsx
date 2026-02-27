import React from 'react'
import './Modal.css'

interface ModalProps {
  show: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
}

export function Modal({ show, onClose, title, children, width = 500 }: ModalProps) {
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
