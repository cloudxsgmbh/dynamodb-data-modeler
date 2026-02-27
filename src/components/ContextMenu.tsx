import React, { useEffect, useRef } from 'react'
import './ContextMenu.css'

export interface ContextMenuItem {
  key: string
  label?: string
  separator?: boolean
  disabled?: boolean
  onClick?: () => void
  submenu?: ContextMenuItem[]
}

export interface ContextMenuPosition {
  x: number
  y: number
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: ContextMenuPosition
  onClose: () => void
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  return (
    <ul
      ref={ref}
      className="context-menu"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((item) => {
        if (item.separator) return <li key={item.key} className="context-menu-separator" />

        if (item.submenu) {
          return (
            <li key={item.key} className="context-menu-item has-submenu">
              <span>{item.label}</span>
              <ul className="context-submenu">
                {item.submenu.map((sub) => (
                  <li
                    key={sub.key}
                    className={`context-menu-item${sub.disabled ? ' disabled' : ''}`}
                    onMouseDown={() => {
                      if (!sub.disabled) {
                        sub.onClick?.()
                        onClose()
                      }
                    }}
                  >
                    {sub.label}
                  </li>
                ))}
              </ul>
            </li>
          )
        }

        return (
          <li
            key={item.key}
            className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
            onMouseDown={() => {
              if (!item.disabled) {
                item.onClick?.()
                onClose()
              }
            }}
          >
            {item.label}
          </li>
        )
      })}
    </ul>
  )
}
