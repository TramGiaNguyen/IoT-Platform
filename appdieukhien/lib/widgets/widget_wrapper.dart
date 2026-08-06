import 'package:flutter/material.dart';

import '../models/layout_override.dart';

/// Callback when a widget layout changes during edit mode.
typedef LayoutChangedCallback = void Function(
    String widgetId, WidgetLayoutOverride layout);

/// Wrapper that adds drag + resize handles around a widget in edit mode.
/// In normal mode, it just positions the child.
class WidgetWrapper extends StatefulWidget {
  final String widgetId;
  final Widget child;
  final double cellSize;
  final int gridWidth;
  final int gridHeight;
  final WidgetLayoutOverride initialLayout;
  final bool isEditMode;
  final LayoutChangedCallback? onLayoutChanged;

  const WidgetWrapper({
    super.key,
    required this.widgetId,
    required this.child,
    required this.cellSize,
    required this.gridWidth,
    required this.gridHeight,
    required this.initialLayout,
    required this.isEditMode,
    this.onLayoutChanged,
  });

  @override
  State<WidgetWrapper> createState() => _WidgetWrapperState();
}

enum _DragMode {
  none,
  move,
  resizeTopLeft,
  resizeTopRight,
  resizeBottomLeft,
  resizeBottomRight,
}

class _WidgetWrapperState extends State<WidgetWrapper> {
  late int _x;
  late int _y;
  late int _width;
  late int _height;

  _DragMode _mode = _DragMode.none;
  Offset? _startGlobalPos;
  int? _startX;
  int? _startY;
  int? _startW;
  int? _startH;

  @override
  void initState() {
    super.initState();
    _x = widget.initialLayout.x;
    _y = widget.initialLayout.y;
    _width = widget.initialLayout.width;
    _height = widget.initialLayout.height;
  }

  @override
  void didUpdateWidget(WidgetWrapper oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialLayout != widget.initialLayout) {
      _x = widget.initialLayout.x;
      _y = widget.initialLayout.y;
      _width = widget.initialLayout.width;
      _height = widget.initialLayout.height;
    }
  }

  int _snapToGridCells(double pixelDelta) {
    return (pixelDelta / widget.cellSize).round();
  }

  _DragMode _detectHandle(Offset localPos) {
    const handleSize = 20.0;
    final wPx = _width * widget.cellSize;
    final hPx = _height * widget.cellSize;

    if (localPos.dx < handleSize && localPos.dy < handleSize) {
      return _DragMode.resizeTopLeft;
    }
    if (localPos.dx > wPx - handleSize && localPos.dy < handleSize) {
      return _DragMode.resizeTopRight;
    }
    if (localPos.dx < handleSize && localPos.dy > hPx - handleSize) {
      return _DragMode.resizeBottomLeft;
    }
    if (localPos.dx > wPx - handleSize && localPos.dy > hPx - handleSize) {
      return _DragMode.resizeBottomRight;
    }
    return _DragMode.move;
  }

  void _onPanStart(DragStartDetails details) {
    if (!widget.isEditMode) return;
    _startGlobalPos = details.globalPosition;
    _startX = _x;
    _startY = _y;
    _startW = _width;
    _startH = _height;
    _mode = _detectHandle(details.localPosition);
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!widget.isEditMode ||
        _mode == _DragMode.none ||
        _startGlobalPos == null) {
      return;
    }

    final dx = details.globalPosition.dx - _startGlobalPos!.dx;
    final dy = details.globalPosition.dy - _startGlobalPos!.dy;
    final cellDx = _snapToGridCells(dx);
    final cellDy = _snapToGridCells(dy);

    switch (_mode) {
      case _DragMode.move:
        _x = (_startX! + cellDx).clamp(0, widget.gridWidth - _width);
        _y = (_startY! + cellDy).clamp(0, widget.gridHeight - _height);
        break;

      case _DragMode.resizeTopLeft:
        {
          final newX =
              (_startX! + cellDx).clamp(0, widget.gridWidth - 1);
          final newY =
              (_startY! + cellDy).clamp(0, widget.gridHeight - 1);
          _x = newX;
          _y = newY;
          _width = (_startW! - cellDx).clamp(1, widget.gridWidth - newX);
          _height =
              (_startH! - cellDy).clamp(1, widget.gridHeight - newY);
        }
        break;

      case _DragMode.resizeTopRight:
        {
          final newY =
              (_startY! + cellDy).clamp(0, widget.gridHeight - 1);
          _y = newY;
          _width =
              (_startW! + cellDx).clamp(1, widget.gridWidth - _startX!);
          _height =
              (_startH! - cellDy).clamp(1, widget.gridHeight - newY);
        }
        break;

      case _DragMode.resizeBottomLeft:
        {
          final newX =
              (_startX! + cellDx).clamp(0, widget.gridWidth - 1);
          _x = newX;
          _width = (_startW! - cellDx).clamp(1, widget.gridWidth - newX);
          _height =
              (_startH! + cellDy).clamp(1, widget.gridHeight - _startY!);
        }
        break;

      case _DragMode.resizeBottomRight:
        {
          _width =
              (_startW! + cellDx).clamp(1, widget.gridWidth - _startX!);
          _height =
              (_startH! + cellDy).clamp(1, widget.gridHeight - _startY!);
        }
        break;

      case _DragMode.none:
        break;
    }

    setState(() {});
  }

  void _onPanEnd(DragEndDetails details) {
    if (!widget.isEditMode) return;
    if (_mode != _DragMode.none) {
      _mode = _DragMode.none;
      _startGlobalPos = null;
      widget.onLayoutChanged?.call(
        widget.widgetId,
        WidgetLayoutOverride(x: _x, y: _y, width: _width, height: _height),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pixelW = _width * widget.cellSize;
    final pixelH = _height * widget.cellSize;

    Widget content = SizedBox(
      width: pixelW,
      height: pixelH,
      child: widget.child,
    );

    if (widget.isEditMode) {
      content = GestureDetector(
        onPanStart: _onPanStart,
        onPanUpdate: _onPanUpdate,
        onPanEnd: _onPanEnd,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(
                    color: Colors.cyanAccent,
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: widget.child,
                ),
              ),
            ),
            _cornerHandle(Alignment.topLeft),
            _cornerHandle(Alignment.topRight),
            _cornerHandle(Alignment.bottomLeft),
            _cornerHandle(Alignment.bottomRight),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(vertical: 2, horizontal: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.7),
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(2),
                    bottomRight: Radius.circular(2),
                  ),
                ),
                child: Text(
                  widget.widgetId,
                  style: const TextStyle(
                    color: Colors.cyanAccent,
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Positioned(
      left: _x * widget.cellSize,
      top: _y * widget.cellSize,
      child: content,
    );
  }

  Widget _cornerHandle(Alignment alignment) {
    const size = 20.0;
    return Positioned.fill(
      child: Align(
        alignment: alignment,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.cyanAccent,
            borderRadius: BorderRadius.circular(4),
            boxShadow: [
              BoxShadow(
                color: Colors.cyanAccent.withValues(alpha: 0.5),
                blurRadius: 6,
                spreadRadius: 1,
              ),
            ],
          ),
          child: const Icon(
            Icons.open_with,
            size: 12,
            color: Colors.black,
          ),
        ),
      ),
    );
  }
}
