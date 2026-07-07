import React, { useState, useRef, useEffect, useCallback } from 'react';
import WidgetPreview from './WidgetPreview';
import '../../styles/dashboard-builder.css';

const CELL_SIZE = 40; // 40px per cell
const GRID_COLS = 24; // 24 columns for more precision
const GRID_ROWS = 50; // 50 rows for more vertical space

export default function Canvas({ widgets, onLayoutChange, onWidgetSelect, onWidgetDelete, token, dashboardId }) {
  const canvasRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [localWidgets, setLocalWidgets] = useState(widgets);

  // Sync with props
  useEffect(() => {
    setLocalWidgets(widgets);
  }, [widgets]);

  // Convert grid position to pixels
  const gridToPixels = (gridX, gridY) => ({
    x: gridX * CELL_SIZE,
    y: gridY * CELL_SIZE
  });

  // Convert pixels to grid position (snapped)
  const pixelsToGrid = (pixelX, pixelY) => ({
    x: Math.max(0, Math.min(GRID_COLS - 1, Math.round(pixelX / CELL_SIZE))),
    y: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(pixelY / CELL_SIZE)))
  });

  // Handle widget selection
  const handleWidgetClick = (e, widgetId) => {
    e.stopPropagation();
    setSelectedId(widgetId);
    onWidgetSelect(localWidgets.find(w => w.id === widgetId));
  };

  // Handle canvas click (deselect)
  const handleCanvasClick = () => {
    setSelectedId(null);
    onWidgetSelect(null);
  };

  // Handle drag start
  const handleDragStart = (e, widgetId) => {
    e.stopPropagation();
    const widget = localWidgets.find(w => w.id === widgetId);
    if (!widget) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const widgetPos = gridToPixels(widget.vi_tri_x, widget.vi_tri_y);

    setIsDragging(true);
    setSelectedId(widgetId);
    setDragOffset({
      x: e.clientX - rect.left - widgetPos.x,
      y: e.clientY - rect.top - widgetPos.y
    });
  };

  // Handle mouse move for dragging/resizing
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (isDragging) {
        const widget = localWidgets.find(w => w.id === selectedId);
        if (!widget) return;

        const newGridPos = pixelsToGrid(mouseX - dragOffset.x, mouseY - dragOffset.y);
        const maxX = GRID_COLS - widget.chieu_rong;
        const maxY = GRID_ROWS - widget.chieu_cao;

        const updatedWidgets = localWidgets.map(w => {
          if (w.id === selectedId) {
            return {
              ...w,
              vi_tri_x: Math.max(0, Math.min(maxX, newGridPos.x)),
              vi_tri_y: Math.max(0, Math.min(maxY, newGridPos.y))
            };
          }
          return w;
        });
        setLocalWidgets(updatedWidgets);
      }

      if (isResizing && resizeHandle) {
        const widget = localWidgets.find(w => w.id === selectedId);
        if (!widget) return;

        const widgetPos = gridToPixels(widget.vi_tri_x, widget.vi_tri_y);
        const widgetWidth = widget.chieu_rong * CELL_SIZE;
        const widgetHeight = widget.chieu_cao * CELL_SIZE;

        let newWidth = widget.chieu_rong;
        let newHeight = widget.chieu_cao;
        let newX = widget.vi_tri_x;
        let newY = widget.vi_tri_y;

        if (resizeHandle.includes('e')) {
          newWidth = Math.max(2, Math.min(GRID_COLS - widget.vi_tri_x, Math.round((mouseX - widgetPos.x) / CELL_SIZE)));
        }
        if (resizeHandle.includes('w')) {
          const deltaX = mouseX - widgetPos.x;
          if (deltaX > 0 && deltaX < widgetWidth) {
            const newGridX = Math.round(deltaX / CELL_SIZE);
            newX = widget.vi_tri_x + newGridX;
            newWidth = widget.chieu_rong - newGridX;
          }
        }
        if (resizeHandle.includes('s')) {
          newHeight = Math.max(2, Math.min(GRID_ROWS - widget.vi_tri_y, Math.round((mouseY - widgetPos.y) / CELL_SIZE)));
        }
        if (resizeHandle.includes('n')) {
          const deltaY = mouseY - widgetPos.y;
          if (deltaY > 0 && deltaY < widgetHeight) {
            const newGridY = Math.round(deltaY / CELL_SIZE);
            newY = widget.vi_tri_y + newGridY;
            newHeight = widget.chieu_cao - newGridY;
          }
        }

        if (newWidth >= 2 && newHeight >= 2) {
          const updatedWidgets = localWidgets.map(w => {
            if (w.id === selectedId) {
              return {
                ...w,
                vi_tri_x: newX,
                vi_tri_y: newY,
                chieu_rong: newWidth,
                chieu_cao: newHeight
              };
            }
            return w;
          });
          setLocalWidgets(updatedWidgets);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        onLayoutChange(localWidgets);
      }
      if (isResizing) {
        setIsResizing(false);
        setResizeHandle(null);
        onLayoutChange(localWidgets);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, selectedId, dragOffset, resizeHandle, localWidgets, onLayoutChange]);

  // Handle resize start
  const handleResizeStart = (e, handle) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
  };

  // Calculate canvas size
  const canvasWidth = GRID_COLS * CELL_SIZE;
  const canvasHeight = GRID_ROWS * CELL_SIZE;

  return (
    <div className="db-canvas-area">
      {/* Toolbar toggle */}
      <div className="db-canvas-toolbar">
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`db-grid-toggle${showGrid ? ' active' : ''}`}
        >
          {showGrid ? 'Ẩn lưới' : 'Hiện lưới'}
        </button>
      </div>

      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="db-canvas-grid"
        style={{
          width: canvasWidth,
          minHeight: canvasHeight,
          backgroundImage: showGrid ? undefined : 'none',
          border: showGrid ? undefined : 'none',
        }}
      >
        {localWidgets.length === 0 ? (
          <div className="db-canvas-empty">
            <div className="db-canvas-empty-icon">📊</div>
            <h3>Canvas trống</h3>
            <p>Kéo widget từ thanh công cụ bên trái vào đây để bắt đầu</p>
          </div>
        ) : (
          localWidgets.map(widget => {
            const pos = gridToPixels(widget.vi_tri_x, widget.vi_tri_y);
            const size = {
              width: widget.chieu_rong * CELL_SIZE,
              height: widget.chieu_cao * CELL_SIZE
            };
            const isSelected = selectedId === widget.id;

            return (
              <div
                key={widget.id}
                className={`db-canvas-widget${isSelected ? ' selected' : ''}${(isDragging || isResizing) && isSelected ? ' dragging' : ''}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: size.width,
                  height: size.height,
                  transition: (isDragging || isResizing) ? 'none' : 'box-shadow 0.2s',
                }}
                onMouseDown={(e) => handleDragStart(e, widget.id)}
                onClick={(e) => handleWidgetClick(e, widget.id)}
              >
                <WidgetPreview
                  widget={widget}
                  onSelect={(w) => {
                    setSelectedId(widget.id);
                    onWidgetSelect(w);
                  }}
                  onDelete={onWidgetDelete}
                  token={token}
                  dashboardId={dashboardId}
                />

                {/* Resize handles (only show when selected) */}
                {isSelected && ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map((h) => (
                  <div
                    key={h}
                    onMouseDown={(e) => handleResizeStart(e, h)}
                    className={`db-resize-handle ${h}`}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Grid size indicator */}
      <div className="db-grid-info">
        Grid: {GRID_COLS} × {GRID_ROWS} cells ({CELL_SIZE}px/cell) | Widgets: {localWidgets.length}
      </div>
    </div>
  );
}

