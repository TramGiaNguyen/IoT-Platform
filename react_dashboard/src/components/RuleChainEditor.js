import React, { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodeTypes = {};

function FilterNode({ data, selected }) {
  const conds = data?.conditions || [];
  const deviceId = data?.condition_device_id || '';
  return (
    <div className={`rule-chain-node filter-node ${selected ? 'selected' : ''}`}>
      <div className="node-header">🔍 Filter</div>
      <div className="node-body">
        <div className="node-field">Device: {deviceId || '(chưa chọn)'}</div>
        {conds.length > 0 ? (
          conds.map((c, i) => (
            <div key={i} className="node-cond">{c.field} {c.operator} {c.value}</div>
          ))
        ) : (
          <div className="node-muted">Chưa có điều kiện</div>
        )}
      </div>
    </div>
  );
}

function ControlNode({ data, selected }) {
  const deviceId = data?.device_id || '';
  const cmd = data?.action_command || '';
  const params = data?.action_params;
  return (
    <div className={`rule-chain-node control-node ${selected ? 'selected' : ''}`}>
      <div className="node-header">⚡ Control</div>
      <div className="node-body">
        <div className="node-field">Device: {deviceId || '(chưa chọn)'}</div>
        <div className="node-field">Lệnh: {cmd || '(chưa chọn)'}</div>
        {params && Object.keys(params).length > 0 && (
          <div className="node-cond">Params: {JSON.stringify(params)}</div>
        )}
      </div>
    </div>
  );
}

function AlarmNode({ data, selected }) {
  return (
    <div className={`rule-chain-node alarm-node ${selected ? 'selected' : ''}`}>
      <div className="node-header">🔔 Alarm</div>
      <div className="node-body">
        <div className="node-muted">Tạo cảnh báo khi điều kiện đúng</div>
      </div>
    </div>
  );
}

function LogNode({ data, selected }) {
  return (
    <div className={`rule-chain-node log-node ${selected ? 'selected' : ''}`}>
      <div className="node-header">📋 Log</div>
      <div className="node-body">
        <div className="node-muted">Ghi log khi điều kiện đúng</div>
      </div>
    </div>
  );
}

const customNodeTypes = {
  filter: FilterNode,
  control: ControlNode,
  alarm: AlarmNode,
  log: LogNode,
};

const defaultEdgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } };

const RuleChainEditor = forwardRef(function RuleChainEditor({
  initialNodes = [],
  initialEdges = [],
  onChange,
  rooms = [],
  roomDevices = [],
  conditionFields = [],
  commandOptions = [],
}, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (initialNodes?.length > 0 || initialEdges?.length > 0) {
      setNodes(initialNodes || []);
      setEdges(initialEdges || []);
    }
  }, [initialNodes?.length, initialEdges?.length]);


  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, ...defaultEdgeOptions }, eds)),
    [setEdges]
  );

  const onNodeDataChange = useCallback(
    (nodeId, newData) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
      );
    },
    [setNodes]
  );

  const addNode = useCallback(
    (type) => {
      const id = `${type}-${Date.now()}`;
      const base = { id, type, position: { x: 250 + Math.random() * 100, y: 150 + Math.random() * 80 }, data: {} };
      if (type === 'filter') base.data = { conditions: [], condition_device_id: '' };
      if (type === 'control') base.data = { device_id: '', action_command: '', action_params: {} };
      setNodes((nds) => [...nds, base]);
    },
    [setNodes]
  );

  const getGraph = useCallback(() => ({ nodes, edges }), [nodes, edges]);

  useImperativeHandle(ref, () => ({ getGraph }), [getGraph]);

  const onSave = useCallback(() => {
    onChange && onChange({ nodes, edges });
  }, [nodes, edges, onChange]);

  const selectedNode = nodes.find((n) => n.selected);
  const isFilter = selectedNode?.type === 'filter';
  const isControl = selectedNode?.type === 'control';

  return (
    <div className="rule-chain-editor">
      <div className="rule-chain-toolbar">
        <button type="button" onClick={() => addNode('filter')}>+ Filter</button>
        <button type="button" onClick={() => addNode('control')}>+ Control</button>
        <button type="button" onClick={() => addNode('alarm')}>+ Alarm</button>
        <button type="button" onClick={() => addNode('log')}>+ Log</button>
        <button type="button" className="primary" onClick={onSave}>Lưu graph</button>
      </div>
      <div className="rule-chain-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          nodeTypes={customNodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      {selectedNode && (
        <Panel position="top-right" className="rule-chain-props">
          <h4>Cấu hình: {selectedNode.type}</h4>
          {isFilter && (
            <>
              <label>
                Thiết bị điều kiện
                <select
                  value={selectedNode.data?.condition_device_id || ''}
                  onChange={(e) => onNodeDataChange(selectedNode.id, { condition_device_id: e.target.value })}
                >
                  <option value="">Chọn thiết bị</option>
                  {roomDevices.map((d) => (
                    <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                  ))}
                </select>
              </label>
              <label>
                Điều kiện (field, operator, value)
                <select
                  value={selectedNode.data?.conditions?.[0]?.field || ''}
                  onChange={(e) => {
                    const conds = selectedNode.data?.conditions || [];
                    const updated = [...conds];
                    if (!updated[0]) updated[0] = { field: '', operator: '>', value: '' };
                    updated[0].field = e.target.value;
                    onNodeDataChange(selectedNode.id, { conditions: updated });
                  }}
                >
                  <option value="">Chọn field</option>
                  {conditionFields.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <select
                  value={selectedNode.data?.conditions?.[0]?.operator || '>'}
                  onChange={(e) => {
                    const conds = selectedNode.data?.conditions || [];
                    const updated = [...conds];
                    if (!updated[0]) updated[0] = { field: '', operator: '>', value: '' };
                    updated[0].operator = e.target.value;
                    onNodeDataChange(selectedNode.id, { conditions: updated });
                  }}
                >
                  {['>', '<', '>=', '<=', '=', '==', '!='].map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <input
                  placeholder="Giá trị"
                  value={selectedNode.data?.conditions?.[0]?.value || ''}
                  onChange={(e) => {
                    const conds = selectedNode.data?.conditions || [];
                    const updated = [...conds];
                    if (!updated[0]) updated[0] = { field: '', operator: '>', value: '' };
                    updated[0].value = e.target.value;
                    onNodeDataChange(selectedNode.id, { conditions: updated });
                  }}
                />
              </label>
            </>
          )}
          {isControl && (
            <>
              <label>
                Thiết bị
                <select
                  value={selectedNode.data?.device_id || ''}
                  onChange={(e) => onNodeDataChange(selectedNode.id, { device_id: e.target.value })}
                >
                  <option value="">Chọn thiết bị</option>
                  {roomDevices.map((d) => (
                    <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                  ))}
                </select>
              </label>
              <label>
                Lệnh
                <select
                  value={selectedNode.data?.action_command || ''}
                  onChange={(e) => onNodeDataChange(selectedNode.id, { action_command: e.target.value })}
                >
                  <option value="">Chọn lệnh</option>
                  {commandOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Params (JSON)
                <input
                  placeholder='{"target": 22}'
                  value={typeof selectedNode.data?.action_params === 'object'
                    ? JSON.stringify(selectedNode.data.action_params || {})
                    : (selectedNode.data?.action_params || '')}
                  onChange={(e) => {
                    try {
                      const p = JSON.parse(e.target.value || '{}');
                      onNodeDataChange(selectedNode.id, { action_params: p });
                    } catch {
                      onNodeDataChange(selectedNode.id, { action_params: {} });
                    }
                  }}
                />
              </label>
            </>
          )}
        </Panel>
      )}
    </div>
  );
});

export default RuleChainEditor;
