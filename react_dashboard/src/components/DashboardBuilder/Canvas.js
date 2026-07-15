import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import WidgetPreview from './WidgetPreview';
import '../../styles/dashboard-builder.css';

const CELL_SIZE = 40;
const GRID_COLS = 24;
const GRID_ROWS = 50;

const CanvasWidget = React.memo(function CanvasWidget({
  widget, size, pos, isSelected, isBeingDragged, dragPixelRef,
  onPreviewSelect, onWidgetDelete, onCanvasWidgetClick,
  onCanvasWidgetMouseDown, onResizeStart, token, dashboardId,
}) {
  const style = useMemo(() => {
    if (isBeingDragged) {
      return {
        position: 'absolute', left: 0, top: 0, zIndex: 1000, willChange: 'transform',
        transform: 'translate(' + dragPixelRef.current.x + 'px, ' + dragPixelRef.current.y + 'px)',
      };
    }
    return { left: pos.x, top: pos.y };
  }, [isBeingDragged, pos.x, pos.y, dragPixelRef]);

  return (
    <div
      className={'db-canvas-widget' + (isSelected ? ' selected' : '') + (isBeingDragged ? ' dragging' : '')}
      style={{
        ...style,
        width: size.width,
        height: size.height,
        transition: isBeingDragged ? 'none' : 'box-shadow 0.2s',
      }}
      onMouseDown={(e) => onCanvasWidgetMouseDown(e, widget.id)}
      onClick={(e) => onCanvasWidgetClick(e, widget.id)}
    >
      <WidgetPreview
        widget={widget}
        onSelect={onPreviewSelect}
        onDelete={onWidgetDelete}
        token={token}
        dashboardId={dashboardId}
        isPreview={true}
      />
      {isSelected && ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map((h) => (
        <div
          key={h}
          onMouseDown={(e) => onResizeStart(e, h)}
          className={'db-resize-handle ' + h}
        />
      ))}
    </div>
  );
});

export default function Canvas({ widgets, onLayoutChange, onWidgetSelect, onWidgetDelete, token, dashboardId }) {
  const canvasRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [localWidgets, setLocalWidgets] = useState(widgets);
  const [, setDragTick] = useState(0);

  const draggingWidgetIdRef = useRef(null);
  const dragStartGridRef = useRef(null);
  const dragPixelRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);

  useEffect(() => {
    setLocalWidgets(widgets);
  }, [widgets]);

  const gridToPixels = (gridX, gridY) => ({ x: gridX * CELL_SIZE, y: gridY * CELL_SIZE });

  const pixelsToGrid = (pixelX, pixelY) => ({
    x: Math.max(0, Math.min(GRID_COLS - 1, Math.round(pixelX / CELL_SIZE))),
    y: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(pixelY / CELL_SIZE)))
  });

  // Stable refs cho parent callbacks (memo-friendly)
  const onWidgetSelectRef = useRef(onWidgetSelect);
  const onLayoutChangeRef = useRef(onLayoutChange);
  const onWidgetDeleteRef = useRef(onWidgetDelete);
  useEffect(() => { onWidgetSelectRef.current = onWidgetSelect; }, [onWidgetSelect]);
  useEffect(() => { onLayoutChangeRef.current = onLayoutChange; }, [onLayoutChange]);
  useEffect(() => { onWidgetDeleteRef.current = onWidgetDelete; }, [onWidgetDelete]);

  const handleCanvasClick = useCallback(() => {
    setSelectedId(null);
    if (onWidgetSelectRef.current) onWidgetSelectRef.current(null);
  }, []);

  const handlePreviewSelect = useCallback((w) => {
    setSelectedId(w.id);
    if (onWidgetSelectRef.current) onWidgetSelectRef.current(w);
  }, []);

  const handleWidgetClick = useCallback((e, widgetId) => {
    e.stopPropagation();
    setSelectedId(widgetId);
    if (onWidgetSelectRef.current) {
      onWidgetSelectRef.current(localWidgets.find(w => w.id === widgetId));
    }
  }, [localWidgets]);

  const handleDragStart = useCallback((e, widgetId) => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.userSelect = 'none';

    const widget = localWidgets.find(w => w.id === widgetId);
    if (!widget) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const widgetPos = gridToPixels(widget.vi_tri_x, widget.vi_tri_y);
    draggingWidgetIdRef.current = widgetId;
    dragStartGridRef.current = { x: widget.vi_tri_x, y: widget.vi_tri_y };
    setIsDragging(true);
    setSelectedId(widgetId);
    setDragOffset({
      x: e.clientX - rect.left - widgetPos.x,
      y: e.clientY - rect.top - widgetPos.y
    });
    dragPixelRef.current = { x: widgetPos.x, y: widgetPos.y };
  }, [localWidgets]);

  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
  }, []);

  // Drag/resize handlers — requestAnimationFrame throttle mousemove
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const scheduleUpdate = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setDragTick(c => c + 1);
      });
    };

    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (isDragging && draggingWidgetIdRef.current) {
        const newPixelX = mouseX - dragOffset.x;
        const newPixelY = mouseY - dragOffset.y;
        dragPixelRef.current = { x: newPixelX, y: newPixelY };
        scheduleUpdate();
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
              return { ...w, vi_tri_x: newX, vi_tri_y: newY, chieu_rong: newWidth, chieu_cao: newHeight };
            }
            return w;
          });
          setLocalWidgets(updatedWidgets);
        }
      }
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      document.body.style.userSelect = '';

      if (isDragging && draggingWidgetIdRef.current) {
        const wId = draggingWidgetIdRef.current;
        const startGrid = dragStartGridRef.current;
        const newGrid = pixelsToGrid(dragPixelRef.current.x, dragPixelRef.current.y);

        if (newGrid.x !== startGrid.x || newGrid.y !== startGrid.y) {
          const updatedWidgets = localWidgets.map(w => {
            if (w.id === wId) {
              return { ...w, vi_tri_x: newGrid.x, vi_tri_y: newGrid.y };
            }
            return w;
          });
          setLocalWidgets(updatedWidgets);
          if (onLayoutChangeRef.current) onLayoutChangeRef.current(updatedWidgets);
        }
        draggingWidgetIdRef.current = null;
        dragStartGridRef.current = null;
        setIsDragging(false);
      }
      if (isResizing) {
        setIsResizing(false);
        setResizeHandle(null);
        if (onLayoutChangeRef.current) onLayoutChangeRef.current(localWidgets);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDragging, isResizing, selectedId, dragOffset, resizeHandle, localWidgets]);

  const canvasWidth = GRID_COLS * CELL_SIZE;
  const canvasHeight = GRID_ROWS * CELL_SIZE;

  return (
    <div className="db-canvas-area">
      <div className="db-canvas-toolbar">
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={'db-grid-toggle' + (showGrid ? ' active' : '')}
        >
          {showGrid ? 'An luoi' : 'Hien luoi'}
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
            <div className="db-canvas-empty-icon">[chart]</div>
            <h3>Canvas trong</h3>
            <p>Keo widget tu thanh cong cu ben trai vao day de bat dau</p>
          </div>
        ) : (
          localWidgets.map(widget => {
            const pos = gridToPixels(widget.vi_tri_x, widget.vi_tri_y);
            const size = {
              width: widget.chieu_rong * CELL_SIZE,
              height: widget.chieu_cao * CELL_SIZE
            };
            const isSelected = selectedId === widget.id;
            const isBeingDragged = isDragging && selectedId === widget.id;

            return (
              <CanvasWidget
                key={widget.id}
                widget={widget}
                pos={pos}
                size={size}
                isSelected={isSelected}
                isBeingDragged={isBeingDragged}
                dragPixelRef={dragPixelRef}
                onPreviewSelect={handlePreviewSelect}
                onWidgetDelete={onWidgetDelete}
                onCanvasWidgetClick={handleWidgetClick}
                onCanvasWidgetMouseDown={handleDragStart}
                onResizeStart={handleResizeStart}
                token={token}
                dashboardId={dashboardId}
              />
            );
          })
        )}
      </div>

      <div className="db-grid-info">
        Grid: {GRID_COLS} x {GRID_ROWS} cells ({CELL_SIZE}px/cell) | Widgets: {localWidgets.length}
      </div>
    </div>
  );
}