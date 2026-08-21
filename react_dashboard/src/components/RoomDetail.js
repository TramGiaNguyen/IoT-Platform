import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, AI_ANALYST_BASE } from '../config/api';
import {
  fetchRoomCameras,
  createRoomCamera,
  updateRoomCamera,
  deleteRoomCamera,
  fetchRoomOccupancy,
  fetchRoomDeviceData,
  fetchCameraZones,
  saveCameraZones,
  deleteCameraZones,
} from '../services';
import { useGlobalCache } from '../context/GlobalCache';

/* ------------------------------------------------------------------ */
/* CSS classes for this component (appended to style.css)              */
/* Uses CSS variables for light/dark mode support                       */
/* ------------------------------------------------------------------ */
const _css = `
/* ===== Room Detail Page Variables ===== */
.room-detail-page {
  --rd-bg: #0b1120;
  --rd-bg-gradient: radial-gradient(circle at 20% 0%, rgba(6, 182, 212, 0.06), transparent 50%),
                    radial-gradient(circle at 80% 100%, rgba(59, 130, 246, 0.05), transparent 40%),
                    #0b1120;
  --rd-text: #e2e8f0;
  --rd-text-secondary: #94a3b8;
  --rd-text-muted: #64748b;
  --rd-text-accent: #22d3ee;

  --rd-card-bg: linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(9, 12, 24, 0.95));
  --rd-card-border: rgba(255, 255, 255, 0.08);
  --rd-card-hover-border: rgba(6, 182, 212, 0.35);

  --rd-header-bg: rgba(15, 23, 42, 0.6);
  --rd-header-border: rgba(255, 255, 255, 0.06);

  --rd-chip-bg: rgba(15, 23, 42, 0.6);
  --rd-chip-border: rgba(255, 255, 255, 0.1);
  --rd-chip-text: #cbd5e1;

  --rd-btn-bg: rgba(15, 23, 42, 0.8);
  --rd-btn-border: rgba(255, 255, 255, 0.1);
  --rd-btn-text: #94a3b8;
  --rd-btn-hover-bg: rgba(6, 182, 212, 0.1);
  --rd-btn-hover-border: #22d3ee;
  --rd-btn-hover-text: #22d3ee;

  --rd-primary-btn-bg: #22d3ee;
  --rd-primary-btn-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);

  --rd-select-bg: rgba(15, 23, 42, 0.8);
  --rd-select-border: rgba(255, 255, 255, 0.12);

  --rd-empty-text: #64748b;

  --rd-status-online: #22c55e;
  --rd-status-offline: #475569;
  --rd-danger-bg: rgba(239, 68, 68, 0.15);
  --rd-danger-text: #fca5a5;
  --rd-danger-border: rgba(239, 68, 68, 0.4);

  --rd-camera-bg: #000;
  --rd-camera-border: rgba(255, 255, 255, 0.08);
  --rd-camera-streaming-border: rgba(34, 211, 238, 0.35);

  --rd-modal-bg: #0f172a;
  --rd-modal-border: rgba(34, 211, 238, 0.3);

  padding: 0;
  min-height: 100vh;
  background: var(--rd-bg-gradient);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Light mode */
[data-theme="light"] .room-detail-page {
  --rd-bg: #f1f5f9;
  --rd-bg-gradient: #f1f5f9;
  --rd-text: #1e293b;
  --rd-text-secondary: #475569;
  --rd-text-muted: #94a3b8;
  --rd-text-accent: #0891b2;

  --rd-card-bg: #ffffff;
  --rd-card-border: #e2e8f0;
  --rd-card-hover-border: rgba(6, 182, 212, 0.5);

  --rd-header-bg: #f8fafc;
  --rd-header-border: #e2e8f0;

  --rd-chip-bg: #f1f5f9;
  --rd-chip-border: #e2e8f0;
  --rd-chip-text: #475569;

  --rd-btn-bg: #ffffff;
  --rd-btn-border: #e2e8f0;
  --rd-btn-text: #64748b;
  --rd-btn-hover-bg: rgba(6, 182, 212, 0.08);
  --rd-btn-hover-border: #0891b2;
  --rd-btn-hover-text: #0891b2;

  --rd-primary-btn-bg: #0891b2;
  --rd-primary-btn-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);

  --rd-select-bg: #ffffff;
  --rd-select-border: #e2e8f0;

  --rd-empty-text: #94a3b8;

  --rd-status-online: #16a34a;
  --rd-status-offline: #94a3b8;
  --rd-danger-bg: rgba(220, 38, 38, 0.08);
  --rd-danger-text: #dc2626;
  --rd-danger-border: rgba(220, 38, 38, 0.4);

  --rd-camera-bg: #1e293b;
  --rd-camera-border: #e2e8f0;
  --rd-camera-streaming-border: #0891b2;

  --rd-modal-bg: #ffffff;
  --rd-modal-border: #e2e8f0;
}

/* ===== Header ===== */
.room-detail-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--rd-header-bg);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--rd-header-border);
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin: 0;
}

.room-detail-header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-detail-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.room-detail-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--rd-text);
  margin: 0;
}

.room-detail-meta {
  font-size: 0.85rem;
  color: var(--rd-text-secondary);
  margin: 0;
}

.room-detail-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* ===== Buttons ===== */
.room-detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--rd-btn-border);
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.room-detail-btn:hover {
  background: var(--rd-btn-hover-bg);
  border-color: var(--rd-btn-hover-border);
  color: var(--rd-btn-hover-text);
}

.room-detail-btn-primary {
  background: var(--rd-primary-btn-bg);
  border-color: transparent;
  color: #0b1224;
  font-weight: 600;
  box-shadow: var(--rd-primary-btn-shadow);
}

.room-detail-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(6, 182, 212, 0.35);
  color: #0b1224;
}

.room-detail-btn-icon {
  padding: 8px;
  min-width: 36px;
  justify-content: center;
}

.room-detail-btn-danger {
  background: var(--rd-danger-bg);
  border-color: var(--rd-danger-border);
  color: var(--rd-danger-text);
}

.room-detail-btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* ===== Content Area ===== */
.room-detail-content {
  padding: 24px;
}

/* ===== Occupancy Banner ===== */
.room-occupancy-banner {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  background: var(--rd-card-bg);
  border: 1px solid var(--rd-card-border);
  border-radius: 14px;
  padding: 16px 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.room-occupancy-count {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--rd-text-accent);
  line-height: 1;
  min-width: 60px;
  text-align: center;
}

.room-occupancy-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.room-occupancy-label-text {
  font-size: 0.9rem;
  color: var(--rd-text-secondary);
}

.room-occupancy-label-time {
  font-size: 0.75rem;
  color: var(--rd-text-muted);
}

/* ===== Section ===== */
.room-detail-section {
  margin-bottom: 32px;
}

.room-detail-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.room-detail-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--rd-text);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-detail-section-badge {
  background: var(--rd-btn-hover-bg);
  color: var(--rd-text-accent);
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

/* ===== Device Chips ===== */
.room-detail-devices {
  margin-bottom: 24px;
}

.device-chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
}

.device-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--rd-chip-bg);
  border: 1px solid var(--rd-chip-border);
  border-radius: 20px;
  font-size: 0.85rem;
  color: var(--rd-chip-text);
  transition: all 0.15s;
}

.device-chip:hover {
  border-color: var(--rd-btn-hover-border);
  background: var(--rd-btn-hover-bg);
}

.no-device {
  color: var(--rd-empty-text);
  font-size: 0.85rem;
  font-style: italic;
}

/* ===== Camera Grid ===== */
.camera-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.camera-card {
  background: var(--rd-card-bg);
  border: 1px solid var(--rd-camera-border);
  border-radius: 14px;
  overflow: hidden;
  transition: all 0.2s;
}

.camera-card:hover {
  border-color: var(--rd-card-hover-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.camera-card.streaming {
  border-color: var(--rd-camera-streaming-border);
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}

.camera-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--rd-header-border);
  background: var(--rd-header-bg);
}

.camera-card-info {
  flex: 1;
  min-width: 0;
}

.cam-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--rd-text);
  margin: 0 0 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cam-sub {
  font-size: 0.78rem;
  color: var(--rd-text-muted);
  margin: 0;
}

.camera-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.camera-live-badge {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
}

/* Camera Stream */
.camera-stream-wrap {
  position: relative;
  background: var(--rd-camera-bg);
  min-height: 200px;
}

.camera-stream-wrap img {
  width: 100%;
  display: block;
  max-height: 280px;
  object-fit: cover;
}

.camera-stream-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--rd-empty-text);
  font-size: 0.85rem;
  gap: 12px;
  padding: 24px;
}

/* Camera Overlay */
.camera-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.78rem;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(4px);
}

.camera-count-badge {
  background: rgba(34, 211, 238, 0.2);
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: 50px;
  padding: 3px 10px;
  font-weight: 700;
  color: #22d3ee;
}

/* Camera Form */
.camera-form {
  padding: 16px;
}

.camera-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.camera-form-grid .full {
  grid-column: 1 / -1;
}

.camera-form-grid label {
  display: block;
  font-size: 0.78rem;
  color: var(--rd-text-muted);
  margin-bottom: 4px;
  font-weight: 500;
}

.camera-form-grid input,
.camera-form-grid select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--rd-select-border);
  background: var(--rd-select-bg);
  color: var(--rd-text);
  font-size: 0.85rem;
  outline: none;
  transition: all 0.15s;
  box-sizing: border-box;
}

.camera-form-grid input:focus,
.camera-form-grid select:focus {
  border-color: var(--rd-text-accent);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.camera-form-grid input::placeholder {
  color: var(--rd-text-muted);
}

.camera-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.camera-form-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s;
}

.camera-form-actions .btn-confirm {
  background: var(--rd-primary-btn-bg);
  color: #0f172a;
  box-shadow: var(--rd-primary-btn-shadow);
}

.camera-form-actions .btn-confirm:hover {
  transform: translateY(-1px);
}

.camera-form-actions .btn-cancel {
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  border: 1px solid var(--rd-btn-border);
}

.camera-form-actions .btn-cancel:hover {
  background: var(--rd-btn-hover-bg);
  color: var(--rd-btn-hover-text);
}

/* Add Camera Button */
.btn-add-camera {
  width: 100%;
  padding: 20px;
  border-radius: 14px;
  border: 2px dashed var(--rd-card-border);
  background: transparent;
  color: var(--rd-text-accent);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-add-camera:hover {
  background: var(--rd-btn-hover-bg);
  border-color: var(--rd-text-accent);
}

/* Status Dot */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-online {
  background: var(--rd-status-online);
  box-shadow: 0 0 6px var(--rd-status-online);
}

.status-offline {
  background: var(--rd-status-offline);
}

/* Zone Editor Modal */
.zone-editor-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zone-editor-inner {
  background: var(--rd-modal-bg);
  border: 1px solid var(--rd-modal-border);
  border-radius: 16px;
  width: 96vw;
  max-width: 1200px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.zone-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--rd-header-border);
  background: var(--rd-header-bg);
}

.zone-editor-header h3 {
  margin: 0;
  color: var(--rd-text);
  font-size: 1.05rem;
}

.zone-editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--rd-header-border);
  background: var(--rd-header-bg);
}

.zone-editor-footer button {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s;
}

.zone-editor-footer .btn-cancel-zone {
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  border: 1px solid var(--rd-btn-border);
}

.zone-editor-footer .btn-save-zone {
  background: var(--rd-primary-btn-bg);
  color: #0f172a;
  box-shadow: var(--rd-primary-btn-shadow);
}

/* Zone Sidebar */
.zone-sidebar {
  width: 280px;
  background: rgba(0, 0, 0, 0.3);
  border-left: 1px solid var(--rd-header-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.zone-sidebar h4 {
  margin: 0 0 10px;
  color: var(--rd-text-muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.zone-list-item {
  background: var(--rd-chip-bg);
  border: 1px solid var(--rd-chip-border);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.zone-item-name {
  font-size: 0.85rem;
  color: var(--rd-text);
  font-weight: 600;
}

.zone-item-type {
  font-size: 0.72rem;
  color: var(--rd-text-muted);
  margin-bottom: 6px;
}

.zone-item-actions {
  display: flex;
  gap: 6px;
}

.zone-item-actions button {
  flex: 1;
  padding: 4px 8px;
  font-size: 0.72rem;
  border-radius: 6px;
  border: 1px solid var(--rd-btn-border);
  background: transparent;
  color: var(--rd-btn-text);
  cursor: pointer;
  transition: all 0.15s;
}

.zone-item-actions button:hover {
  background: var(--rd-btn-hover-bg);
  color: var(--rd-btn-hover-text);
}

/* Zone Add Form */
.zone-add-form {
  padding: 12px;
  border-top: 1px solid var(--rd-header-border);
}

.zone-add-form input,
.zone-add-form select {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--rd-select-border);
  background: var(--rd-select-bg);
  color: var(--rd-text);
  font-size: 0.82rem;
  margin-bottom: 8px;
  outline: none;
  box-sizing: border-box;
}

.zone-add-form input:focus,
.zone-add-form select:focus {
  border-color: var(--rd-text-accent);
}

/* Zone Occupancy List */
.zone-occupancy-list {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid var(--rd-card-border);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
  max-height: 260px;
  overflow-y: auto;
  backdrop-filter: blur(4px);
}

/* App Display Fields Modal */
.app-display-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-display-modal {
  background: var(--rd-modal-bg);
  border: 1px solid var(--rd-modal-border);
  border-radius: 16px;
  width: 90vw;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-display-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--rd-header-border);
  background: var(--rd-header-bg);
}

.app-display-modal-header h3 {
  margin: 0;
  color: var(--rd-text);
  font-size: 1.1rem;
}

.app-display-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.app-display-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--rd-header-border);
  background: var(--rd-header-bg);
}

.app-display-field-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--rd-chip-bg);
  border: 1px solid var(--rd-chip-border);
  border-radius: 10px;
  transition: border-color 0.15s;
}

.app-display-field-item:hover {
  border-color: var(--rd-text-accent);
}

.app-display-field-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--rd-text-accent);
  cursor: pointer;
}

.app-display-field-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--rd-text);
}

.app-display-field-unit {
  font-size: 0.78rem;
  color: var(--rd-text-muted);
}

.app-display-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}

.btn-select-all {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--rd-btn-hover-border);
  background: var(--rd-btn-hover-bg);
  color: var(--rd-text-accent);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-select-all:hover {
  background: rgba(6, 182, 212, 0.2);
}

.btn-clear {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--rd-danger-border);
  background: var(--rd-danger-bg);
  color: var(--rd-danger-text);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-clear:hover {
  background: rgba(239, 68, 68, 0.2);
}

.btn-save-app-display {
  background: var(--rd-primary-btn-bg);
  color: #0f172a;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  box-shadow: var(--rd-primary-btn-shadow);
  transition: all 0.15s;
}

.btn-save-app-display:hover {
  transform: translateY(-1px);
}

.btn-cancel-app-display {
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  border: 1px solid var(--rd-btn-border);
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.btn-cancel-app-display:hover {
  background: var(--rd-btn-hover-bg);
  color: var(--rd-btn-hover-text);
}

.app-display-no-fields {
  text-align: center;
  padding: 24px;
  color: var(--rd-empty-text);
  font-size: 0.85rem;
}

/* Zone Mode Indicator */
.zone-mode-indicator {
  padding: 8px 12px;
  border-top: 1px solid var(--rd-header-border);
  background: rgba(0, 0, 0, 0.2);
  font-size: 0.75rem;
  color: var(--rd-text-muted);
  display: flex;
  justify-content: space-between;
}

.zone-mode-indicator .mode-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.72rem;
}

.zone-mode-indicator .mode-drawing {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.zone-mode-indicator .mode-idle {
  background: rgba(34, 211, 238, 0.1);
  color: var(--rd-text-accent);
}

/* Responsive */
@media (max-width: 768px) {
  .room-detail-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }

  .room-detail-actions {
    justify-content: flex-end;
  }

  .camera-grid {
    grid-template-columns: 1fr;
  }

  .camera-form-grid {
    grid-template-columns: 1fr;
  }

  .camera-form-grid .full {
    grid-column: 1;
  }
}

/* Legacy class names for backward compatibility */
.camera-form {
  padding: 16px;
}

.camera-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.camera-form-grid .full {
  grid-column: 1 / -1;
}

.camera-form-grid label {
  display: block;
  font-size: 0.78rem;
  color: var(--rd-text-muted);
  margin-bottom: 4px;
  font-weight: 500;
}

.camera-form-grid input,
.camera-form-grid select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--rd-select-border);
  background: var(--rd-select-bg);
  color: var(--rd-text);
  font-size: 0.85rem;
  outline: none;
  transition: all 0.15s;
  box-sizing: border-box;
}

.camera-form-grid input:focus,
.camera-form-grid select:focus {
  border-color: var(--rd-text-accent);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.camera-form-grid input::placeholder {
  color: var(--rd-text-muted);
}

.camera-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.camera-form-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s;
}

.camera-form-actions .btn-confirm {
  background: var(--rd-primary-btn-bg);
  color: #0f172a;
  box-shadow: var(--rd-primary-btn-shadow);
}

.camera-form-actions .btn-cancel {
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  border: 1px solid var(--rd-btn-border);
}

/* Legacy btn-icon class */
.btn-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--rd-btn-border);
  background: var(--rd-btn-bg);
  color: var(--rd-btn-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-size: 0.9rem;
}

.btn-icon:hover {
  background: var(--rd-btn-hover-bg);
  border-color: var(--rd-btn-hover-border);
  color: var(--rd-btn-hover-text);
}

.btn-icon.danger {
  background: var(--rd-danger-bg);
  border-color: var(--rd-danger-border);
  color: var(--rd-danger-text);
}

.btn-icon.danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* Zone sidebar scroll area */
.zone-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Zone add point button */
.zone-add-form .btn-add-point {
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  border: 1px dashed var(--rd-btn-hover-border);
  background: transparent;
  color: var(--rd-text-accent);
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.2s;
}

.zone-add-form .btn-add-point:hover {
  background: var(--rd-btn-hover-bg);
}

/* Zone list item variants */
.zone-list-item.entry-zone {
  border-color: rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.05);
}

.zone-list-item.active-zone {
  border-color: var(--rd-text-accent);
  background: rgba(34, 211, 238, 0.08);
}

/* Configure zones button */
.btn-configure-zones {
  margin-top: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--rd-btn-hover-border);
  background: var(--rd-btn-hover-bg);
  color: var(--rd-text-accent);
  cursor: pointer;
  font-size: 0.78rem;
  transition: background 0.2s;
}

.btn-configure-zones:hover {
  background: rgba(6, 182, 212, 0.2);
}

/* Zone canvas wrapper */
.zone-canvas-wrap {
  flex: 1;
  position: relative;
  background: #000;
  overflow: hidden;
}

.zone-canvas-wrap img {
  width: 100%;
  display: block;
  max-height: 70vh;
}

.zone-canvas-wrap canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
`;
if (!document.getElementById('room-detail-css')) {
  const s = document.createElement('style');
  s.id = 'room-detail-css';
  s.textContent = _css;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function hdr(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

function statusDot(status) {
  return <span className={`status-dot ${status === 'online' ? 'status-online' : 'status-offline'}`} />;
}

/* ------------------------------------------------------------------ */
/* ZoneEditor — draw polygons on canvas + text input fallback                 */
/* ------------------------------------------------------------------ */
function ZoneEditor({ camera, streamSessionId, roomId, token, onClose, onSaved }) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  /* Draw mode state (like zone_configurator.py) */
  const [drawMode, setDrawMode] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]); // display-space coords being drawn
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('monitor');

  /* Text input fallback */
  const [newCoords, setNewCoords] = useState('');
  const [parseError, setParseError] = useState('');

  const wrapRef = useRef(null);   // outer wrapper
  const imgRef = useRef(null);    // MJPEG img
  const overlayRef = useRef(null); // transparent canvas for drawing

  /* stream dims + display dims from server + ResizeObserver */
  const [dims, setDims] = useState({ streamW: 0, streamH: 0, displayW: 0, displayH: 0 });

  /* Load existing zones */
  useEffect(() => {
    fetchCameraZones(roomId, camera.id, token)
      .then(r => { setZones(r.data.zones || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId, camera.id, token]);

  /* Poll stream resolution from server */
  useEffect(() => {
    if (!streamSessionId) return;
    const poll = () => {
      axios.get(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/info`)
        .then(r => {
          const d = r.data;
          const img = imgRef.current;
          setDims(prev => ({
            streamW: d.stream_w || prev.streamW || 1,
            streamH: d.stream_h || prev.streamH || 1,
            displayW: img ? img.clientWidth : prev.displayW || 1,
            displayH: img ? img.clientHeight : prev.displayH || 1,
          }));
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [streamSessionId]);

  /* Track display dims + resize overlay canvas to match img */
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const sync = () => {
      const dw = img.clientWidth || 1;
      const dh = img.clientHeight || 1;
      setDims(prev => ({ ...prev, displayW: dw, displayH: dh }));
      // Match overlay canvas size to displayed image
      if (overlayRef.current) {
        overlayRef.current.width = dw;
        overlayRef.current.height = dh;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(img);
    return () => ro.disconnect();
  }, []);

  /* Redraw overlay canvas whenever zones/points/dims change */
  useEffect(() => {
    const oc = overlayRef.current;
    if (!oc) return;
    const ctx = oc.getContext('2d');
    ctx.clearRect(0, 0, oc.width, oc.height);
    if (!dims.streamW || !dims.displayW) return;

    const sx = dims.displayW / dims.streamW;
    const sy = dims.displayH / dims.streamH;

    // Draw completed zones
    zones.forEach((z, i) => {
      const pts = (z.polygon_points || z.points || []);
      if (pts.length < 3) return;
      const isActive = activeIdx === i;
      const isEntry = z.is_entry_zone;
      ctx.beginPath();
      const toDisp = (p) => [Number(p[0]) * sx, Number(p[1]) * sy];
      const [x0, y0] = toDisp(pts[0]);
      ctx.moveTo(x0, y0);
      for (let k = 1; k < pts.length; k++) {
        const [x, y] = toDisp(pts[k]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = isActive ? '#22d3ee' : isEntry ? '#fbbf24' : '#4ade80';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.fillStyle = isEntry ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.1)';
      ctx.fill();
      ctx.stroke();

      // Label
      const cx = pts.reduce((a, p) => a + Number(p[0]), 0) / pts.length * sx;
      const cy = pts.reduce((a, p) => a + Number(p[1]), 0) / pts.length * sy;
      ctx.fillStyle = isEntry ? '#fbbf24' : '#4ade80';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(z.zone_name || `Z${i + 1}`, cx + 4, cy);
    });

    // Draw current polygon being created
    if (currentPoints.length > 0) {
      const color = newZoneType === 'entry' ? '#fb923c' : '#a78bfa';
      ctx.beginPath();
      const [x0, y0] = currentPoints[0];
      ctx.moveTo(x0, y0);
      for (let k = 1; k < currentPoints.length; k++) {
        ctx.lineTo(currentPoints[k][0], currentPoints[k][1]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw point circles
      currentPoints.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw point count
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${currentPoints.length} diem`, 10, oc.height - 8);
    }
  }, [zones, currentPoints, activeIdx, dims, newZoneType]);

  /* Convert display coords → stream (original) coords */
  const displayToStream = (dx, dy) => {
    const sx = dims.streamW / dims.displayW;
    const sy = dims.streamH / dims.displayH;
    return [Math.round(dx * sx), Math.round(dy * sy)];
  };

  /* Handle click on overlay canvas to add polygon points */
  const handleCanvasClick = (e) => {
    if (!drawMode || !dims.streamW) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    setCurrentPoints(prev => [...prev, [dx, dy]]);
  };

  /* Handle right-click to complete polygon */
  const handleCanvasRightClick = (e) => {
    e.preventDefault();
    if (!drawMode || currentPoints.length < 3) return;
    completePolygonFromCanvas();
  };

  /* Complete current drawing and add as zone */
  const completePolygonFromCanvas = () => {
    if (currentPoints.length < 3) return;
    const name = newZoneName.trim() || `Zone ${zones.length + 1}`;
    // Convert display → stream coords for storage
    const streamPts = currentPoints.map(([dx, dy]) => displayToStream(dx, dy));
    setZones(prev => [
      ...prev,
      {
        zone_name: name,
        zone_index: prev.length + 1,
        polygon_points: streamPts,
        is_entry_zone: newZoneType === 'entry',
      },
    ]);
    setCurrentPoints([]);
    setDrawMode(false);
    setNewZoneName('');
    setNewZoneType('monitor');
  };

  /* Text input: parse coordinate string */
  const parseCoords = (raw) => {
    setParseError('');
    try {
      let arr = JSON.parse(raw.trim());
      if (!Array.isArray(arr)) throw new Error('Not an array');
      if (typeof arr[0] === 'number') {
        const pairs = [];
        for (let i = 0; i + 1 < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]]);
        arr = pairs;
      }
      const result = arr.map(p => {
        if (!Array.isArray(p) || p.length < 2) throw new Error();
        return [Number(p[0]), Number(p[1])];
      });
      if (result.length < 3) { setParseError('Cần ít nhất 3 điểm.'); return null; }
      return result;
    } catch (_) {
      const tuplePattern = raw.trim().match(/\(\s*\d+\s*,\s*\d+\s*\)/g);
      if (!tuplePattern) { setParseError('VD: [(124,311),(104,287),(57,287)]'); return null; }
      const result = tuplePattern.map(t => {
        const nums = t.match(/\d+/g);
        return [Number(nums[0]), Number(nums[1])];
      });
      if (result.length < 3) { setParseError('Cần ít nhất 3 điểm.'); return null; }
      return result;
    }
  };

  /* Add zone from text input */
  const handleAddFromText = () => {
    const pts = parseCoords(newCoords);
    if (!pts) return;
    const name = newZoneName.trim() || `Zone ${zones.length + 1}`;
    setZones(prev => [
      ...prev,
      { zone_name: name, zone_index: prev.length + 1, polygon_points: pts, is_entry_zone: newZoneType === 'entry' },
    ]);
    setNewCoords('');
    setNewZoneName('');
    setNewZoneType('monitor');
    setParseError('');
  };

  const deleteZone = (idx) => {
    setZones(prev => prev.filter((_, i) => i !== idx));
    if (activeIdx === idx) setActiveIdx(-1);
    else if (activeIdx > idx) setActiveIdx(activeIdx - 1);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = zones.map((z, i) => ({
        zone_name: z.zone_name || `Zone ${i + 1}`,
        zone_index: i + 1,
        polygon_points: z.polygon_points || z.points || [],
        is_entry_zone: z.is_entry_zone || false,
      }));
      await saveCameraZones(roomId, camera.id, payload, token);
      onSaved && onSaved();
      onClose();
    } catch (e) {
      alert('Lưu zone thất bại: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const streamUrl = streamSessionId
    ? `${AI_ANALYST_BASE}/sessions/${streamSessionId}/stream.mjpeg?t=${Date.now()}`
    : null;

  return (
    <div className="zone-editor-modal">
      <div className="zone-editor-inner">
        <div className="zone-editor-header">
          <h3>Cấu hình Zone — {camera.ten || `Camera ${camera.id}`}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              title="Toan man hinh"
              onClick={() => {
                const el = document.querySelector('.zone-editor-inner');
                if (el && el.requestFullscreen) {
                  if (!document.fullscreenElement) el.requestFullscreen();
                  else document.exitFullscreen();
                }
              }}
              style={{ background: 'transparent', border: '1px solid var(--rd-btn-border)', color: 'var(--rd-btn-text)', fontSize: '1rem', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', lineHeight: 1 }}
            >
              ⛶
            </button>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--rd-btn-text)', fontSize: '1.2rem', cursor: 'pointer' }}
            >×</button>
          </div>
        </div>

        <div className="zone-editor-body" style={{ flexDirection: 'column', overflow: 'hidden', padding: '12px', gap: '12px' }}>
          {/* Preview: MJPEG img + transparent canvas overlay for drawing */}
          <div ref={wrapRef} style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
            {streamUrl ? (
              <img
                ref={imgRef}
                src={streamUrl}
                alt="Camera stream"
                crossOrigin="anonymous"
                style={{ display: 'block', width: '100%', maxHeight: '420px' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#475569', fontSize: '0.85rem' }}>
                Camera chưa kết nối — mở camera trước để vẽ zone
              </div>
            )}
            {/* Drawing canvas overlay — transparent, pointer-events active when drawMode */}
            <canvas
              ref={overlayRef}
              onClick={handleCanvasClick}
              onContextMenu={handleCanvasRightClick}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                cursor: drawMode ? 'crosshair' : 'default',
                pointerEvents: drawMode ? 'auto' : 'none',
              }}
            />
            {/* Legend */}
            <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 10, fontSize: '0.72rem', color: '#fff', textShadow: '0 1px 3px #000' }}>
              <span style={{ color: '#4ade80' }}>■ Monitor</span>
              <span style={{ color: '#fbbf24' }}>■ Entry</span>
              {drawMode && <span style={{ color: '#a78bfa' }}>● Đang vẽ ({currentPoints.length} điểm)</span>}
            </div>
          </div>

          {/* Draw mode controls + zone list + text input — side by side */}
          <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
            {/* Left: draw controls + zone list */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              {/* Draw mode controls */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <select
                    value={newZoneType}
                    onChange={e => setNewZoneType(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: '0.8rem' }}
                  >
                    <option value="monitor">Monitor (xanh)</option>
                    <option value="entry">Entry (vàng)</option>
                  </select>
                  {!drawMode ? (
                    <button
                      onClick={() => { setDrawMode(true); setCurrentPoints([]); setNewZoneName(''); }}
                      style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(34,211,238,0.4)', background: 'rgba(34,211,238,0.1)', color: '#22d3ee', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      ✏ Vẽ Zone Mới
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={completePolygonFromCanvas}
                        disabled={currentPoints.length < 3}
                        style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: currentPoints.length >= 3 ? '#22c55e' : 'rgba(34,197,94,0.3)', color: currentPoints.length >= 3 ? '#fff' : '#64748b', cursor: currentPoints.length >= 3 ? 'pointer' : 'not-allowed', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        ✓ Xác nhận ({currentPoints.length}/3+)
                      </button>
                      <button
                        onClick={() => { setDrawMode(false); setCurrentPoints([]); }}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Hủy
                      </button>
                    </>
                  )}
                </div>
                {drawMode && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Click trái: thêm điểm · Click phải: hoàn thành · Đang vẽ: <b style={{ color: '#a78bfa' }}>{currentPoints.length} điểm</b>
                  </div>
                )}
                {!drawMode && (
                  <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                    Nhấn "Vẽ Zone Mới" rồi click trên hình để thêm điểm polygon
                  </div>
                )}
              </div>

              {/* Zone list */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Zones ({zones.length})
                </h4>
                {loading ? (
                  <p style={{ color: '#475569', fontSize: '0.8rem' }}>Đang tải...</p>
                ) : zones.length === 0 ? (
                  <p style={{ color: '#475569', fontSize: '0.8rem' }}>Chưa có zone — vẽ hoặc nhập tọa độ</p>
                ) : (
                  zones.map((z, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${activeIdx === i ? '#22d3ee' : z.is_entry_zone ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer',
                    }}
                      onClick={() => setActiveIdx(activeIdx === i ? -1 : i)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 600 }}>{z.zone_name || `Zone ${i + 1}`}</span>
                        <span style={{ fontSize: '0.7rem', color: '#475569' }}>{z.is_entry_zone ? 'Entry' : 'Monitor'} · {(z.polygon_points || z.points || []).length}đ</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#475569', fontFamily: 'monospace', marginTop: 3, wordBreak: 'break-all' }}>
                        {JSON.stringify(z.polygon_points || z.points || [])}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }} style={{ flex: 1, padding: '2px 6px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Highlight</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteZone(i); }} style={{ flex: 1, padding: '2px 6px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', cursor: 'pointer' }}>Xóa</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: text input fallback */}
            <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', margin: 0 }}>
                Hoặc nhập tọa độ
              </h4>
              <input
                placeholder="Tên zone"
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <textarea
                placeholder={'[(124,311),(104,287),(57,287),(4,286)]\nhoặc flat: [124,311,104,287,57,287]'}
                value={newCoords}
                onChange={e => { setNewCoords(e.target.value); setParseError(''); }}
                rows={4}
                style={{
                  width: '100%', padding: '7px 9px', borderRadius: 6,
                  border: parseError ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
                  fontSize: '0.75rem', fontFamily: 'monospace', resize: 'vertical',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {parseError && <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{parseError}</div>}
              <button
                onClick={handleAddFromText}
                disabled={!newCoords.trim()}
                style={{
                  padding: '7px', borderRadius: 6, border: '1px solid rgba(34,211,238,0.4)',
                  background: newCoords.trim() ? 'rgba(34,211,238,0.1)' : 'transparent',
                  color: newCoords.trim() ? '#22d3ee' : '#475569',
                  cursor: newCoords.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.82rem', fontWeight: 600,
                }}
              >
                + Thêm từ tọa độ
              </button>
            </div>
          </div>
        </div>

        <div className="zone-editor-footer">
          <button className="btn-cancel-zone" onClick={onClose}>Hủy</button>
          <button className="btn-save-zone" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu Zones'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* CameraCard                                                          */
/* ------------------------------------------------------------------ */
function CameraCard({ camera, roomId, token, onDelete, onUpdate, onPeopleCount }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    ten: camera.ten || '',
    ip_address: camera.ip_address || '',
    port: camera.port || 554,
    rtsp_path: camera.rtsp_path || '',
    username: camera.username || '',
    password: '',
    stream_url: camera.stream_url || '',
    is_active: camera.is_active !== false,
  });
  const [loading, setLoading] = useState(false);
  const [streamSessionId, setStreamSessionId] = useState(null);
  const [peopleCount, setPeopleCount] = useState(0);
  const [streamFps, setStreamFps] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const imgRef = useRef(null);
  const pollRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  /* Zones + resolution for overlay */
  const [streamZones, setStreamZones] = useState([]);
  /* Stream dims from /sessions/{id}/info (actual MJPEG output, may differ from camera native) */
  const [streamDims, setStreamDims] = useState({ streamW: 0, streamH: 0, displayW: 0, displayH: 0 });
  /* Zone occupancy (seconds + people count per zone) */
  const [zoneOccupancy, setZoneOccupancy] = useState([]);

  /* Load zones for this camera whenever stream is active */
  useEffect(() => {
    if (!streamSessionId || !camera.id) return;
    fetchCameraZones(roomId, camera.id, token)
      .then(r => setStreamZones(r.data.zones || []))
      .catch(() => setStreamZones([]));
  }, [streamSessionId, camera.id, roomId, token]);

  /* Poll zone occupancy from ai_analyst */
  useEffect(() => {
    if (!streamSessionId || !camera.id) return;
    const poll = async () => {
      try {
        const r = await axios.get(`${AI_ANALYST_BASE}/internal/ai/zones/occupancy/${camera.id}`);
        setZoneOccupancy(r.data.zones || []);
      } catch (_) { setZoneOccupancy([]); }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [streamSessionId, camera.id]);

  /* Poll status+resolution from server every 1s */
  useEffect(() => {
    if (!streamSessionId) return;
    const poll = () => {
      axios.get(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/info`)
        .then(r => {
          const d = r.data;
          setPeopleCount(d.so_nguoi);
          setStreamFps(d.fps);
          if (d.status === 'error') setStreamError(d.error);
          if (d.stream_w && d.stream_h) {
            const img = imgRef.current;
            setStreamDims(prev => ({
              ...prev,
              streamW: d.stream_w,
              streamH: d.stream_h,
              displayW: img ? img.clientWidth : prev.displayW || 1,
              displayH: img ? img.clientHeight : prev.displayH || 1,
            }));
          }
        })
        .catch(() => {});
    };
    pollRef.current = setInterval(poll, 1000);
    return () => clearInterval(pollRef.current);
  }, [streamSessionId]);

  /* Track displayed stream dimensions for SVG scaling */
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => {
      setStreamDims(prev => ({
        ...prev,
        displayW: img.clientWidth || 1,
        displayH: img.clientHeight || 1,
      }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => ro.disconnect();
  }, []);

  /* Scale polygon coords: polygon space → display space via stream→display ratio */
  const toDisplayPts = (pts) => {
    if (!pts || pts.length < 3) return null;
    if (!streamDims.streamW || !streamDims.displayW) return null;
    const sx = streamDims.displayW / streamDims.streamW;
    const sy = streamDims.displayH / streamDims.streamH;
    return pts.map(([x, y]) => `${x * sx},${y * sy}`).join(' ');
  };

  /* poll status + resolution while streaming (via /info endpoint) */
  useEffect(() => {
    if (!streamSessionId) return;
    const poll = () => {
      axios.get(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/info`)
        .then(r => {
          const d = r.data;
          setPeopleCount(d.so_nguoi);
          setStreamFps(d.fps);
          if (d.status === 'error') setStreamError(d.error);
          onPeopleCount && onPeopleCount(d.so_nguoi);
          if (d.stream_w && d.stream_h) {
            const img = imgRef.current;
            setStreamDims(prev => ({
              streamW: d.stream_w,
              streamH: d.stream_h,
              displayW: img ? img.clientWidth : prev.displayW || 1,
              displayH: img ? img.clientHeight : prev.displayH || 1,
            }));
          }
        })
        .catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => clearInterval(pollRef.current);
  }, [streamSessionId, onPeopleCount]);

  /* stop stream — KHÔNG auto-stop khi unmount (server giữ session nền 24/7) */
  const stopStream = useCallback(() => {
    if (streamSessionId) {
      axios.post(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/stop`).catch(() => {});
      setStreamSessionId(null);
    }
    clearInterval(pollRef.current);
    setConnected(false);
    setStreamError(null);
    setPeopleCount(0);
    setStreamFps(null);
  }, [streamSessionId]);

  // Không auto-stop khi unmount — AI nền 24/7 vẫn chạy trên server

  /* Gắn vào session đã có khi mount (AI nền đã chạy sẵn) */
  useEffect(() => {
    if (streamSessionId || !camera.id) return;
    axios.get(`${AI_ANALYST_BASE}/sessions/lookup?room_id=${roomId}&camera_id=${camera.id}`)
      .then(r => {
        setStreamSessionId(r.data.session_id);
      })
      .catch(() => {});
  }, []); // chỉ chạy 1 lần khi mount

  /* reconnect img on session change */
  useEffect(() => {
    if (!streamSessionId || !imgRef.current) return;
    imgRef.current.src = `${AI_ANALYST_BASE}/sessions/${streamSessionId}/stream.mjpeg?t=${Date.now()}`;
    imgRef.current.onload = () => setConnected(true);
    imgRef.current.onerror = () => setConnected(false);
  }, [streamSessionId]);

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      // If camera already exists, just start AI session
      // If not, create camera first
      let cameraId = camera.id;
      
      if (!cameraId) {
        const res = await createRoomCamera(roomId, {
          ten: form.ten || `Camera ${camera.ten || ''}`,
          ip_address: form.ip_address,
          port: form.port || 554,
          rtsp_path: form.rtsp_path,
          username: form.username || undefined,
          password: form.password || undefined,
          stream_url: form.stream_url || undefined,
          thu_tu: camera.thu_tu || 0,
        }, token);
        cameraId = res.data.camera.id;
      }

      /* start AI session */
      const { session_id } = (await axios.post(
        `${AI_ANALYST_BASE}/sessions/start`,
        { room_id: Number(roomId), camera_id: cameraId }
      )).data;

      setStreamSessionId(session_id);
      setEditing(false);
      if (!camera.id) {
        // Only reload if we created a new camera
        onUpdate();
      }
    } catch (e) {
      alert('Không thể kết nối camera: ' + (e.response?.data?.detail || e.message));
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateRoomCamera(roomId, camera.id, {
        ten: form.ten,
        ip_address: form.ip_address,
        port: form.port,
        rtsp_path: form.rtsp_path,
        username: form.username || undefined,
        password: form.password || undefined,
        stream_url: form.stream_url || undefined,
        is_active: form.is_active,
      }, token);
      setEditing(false);
      onUpdate();
    } catch (e) {
      alert('Lỗi cập nhật: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleStopStream = () => {
    stopStream();
  };

  const field = (name, label, placeholder, full = false) => (
    <div className={full ? 'full' : ''}>
      <label>{label}</label>
      <input
        placeholder={placeholder}
        value={form[name] ?? ''}
        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className={`camera-card${streamSessionId ? ' streaming' : ''}`}>
      <div className="camera-card-header">
        <div className="camera-card-info">
          <div className="cam-title">{camera.ten || `Camera ${camera.id}`}</div>
          {camera.ip_address && <div className="cam-sub">{camera.ip_address}:{camera.port || 554}</div>}
        </div>
        <div className="camera-card-actions">
          {streamSessionId && (
            <span className="camera-live-badge">● LIVE</span>
          )}
          <button
            className="room-detail-btn room-detail-btn-icon"
            title="Sua"
            onClick={() => setEditing(!editing)}
          >
            ✎
          </button>
          <button
            className="room-detail-btn room-detail-btn-icon room-detail-btn-danger"
            title="Xoa camera"
            onClick={() => {
              stopStream();
              onDelete(camera.id);
            }}
          >×</button>
          <button
            className="room-detail-btn room-detail-btn-icon"
            title="Cấu hình Zone"
            onClick={() => setZoneEditorOpen(true)}
            style={{ color: streamSessionId ? 'var(--rd-text-accent)' : 'var(--rd-text-muted)' }}
          >
            ◇
          </button>
        </div>
      </div>

      {/* Stream */}
      <div className="camera-stream-wrap">
        {streamSessionId ? (
          <>
            <img
              ref={imgRef}
              alt="Camera stream"
              onError={() => setConnected(false)}
              onLoad={() => setConnected(true)}
            />
            {/* Zone overlay SVG — shown on main stream after zones are saved */}
            {streamDims.streamW > 0 && streamDims.displayW > 0 && streamZones.length > 0 && (
              <svg
                viewBox={`0 0 ${streamDims.displayW} ${streamDims.displayH}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                {streamZones.map((z, i) => {
                  const pts = toDisplayPts(z.polygon_points || z.points);
                  if (!pts) return null;
                  const isEntry = z.is_entry_zone;
                  const stroke = isEntry ? '#fbbf24' : '#4ade80';
                  const fill = isEntry ? 'rgba(251,191,36,0.18)' : 'rgba(74,222,128,0.12)';
                  const all = z.polygon_points || z.points || [];
                  const sx = streamDims.displayW / streamDims.streamW;
                  const sy = streamDims.displayH / streamDims.streamH;
                  const cx = all.reduce((a, p) => a + Number(p[0]), 0) / all.length * sx;
                  const cy = all.reduce((a, p) => a + Number(p[1]), 0) / all.length * sy;
                  return (
                    <g key={i}>
                      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={2} />
                      <text x={cx} y={cy} fill={stroke} fontSize="12" fontWeight="bold"
                        textAnchor="middle" dominantBaseline="middle">
                        {z.zone_name || `Z${i + 1}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            <div className="camera-overlay">
              {connected && <span style={{ color: '#22c55e' }}>●</span>}
              {!connected && <span>...</span>}
              <span className="camera-count-badge">{peopleCount} nguoi</span>
              {streamFps && <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{streamFps}fps</span>}
            </div>
            {/* Zone occupancy list — right side of overlay */}
            {zoneOccupancy.length > 0 && (
              <div className="zone-occupancy-list">
                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Zones</div>
                {zoneOccupancy.map((z, i) => (
                  <div key={i}>
                    {/* Zone header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '0.68rem', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ color: z.occupied ? '#4ade80' : '#475569', fontWeight: 700, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.zone_name || `Z${i + 1}`}</span>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>{z.people_count}ng</span>
                    </div>
                    {/* Per-person time rows */}
                    {z.track_times && z.track_times.length > 0 && z.track_times.map((tt, j) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, paddingLeft: 8, fontSize: '0.63rem', color: '#94a3b8', marginBottom: 1 }}>
                        <span>ID{tt.track_id}</span>
                        <span style={{ color: tt.seconds >= 60 ? '#4ade80' : tt.seconds >= 10 ? '#fbbf24' : '#94a3b8', fontFamily: 'monospace' }}>
                          {tt.seconds >= 60 ? `${Math.floor(tt.seconds / 60)}m${tt.seconds % 60}s` : `${tt.seconds}s`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={handleStopStream}
              style={{
                position: 'absolute', bottom: 8, right: 8,
                background: 'rgba(239,68,68,0.8)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '4px 10px',
                fontSize: '0.75rem', cursor: 'pointer',
              }}
            >Dung</button>
          </>
        ) : (
          <div className="camera-stream-placeholder">
            {streamError ? (
              <span style={{ color: '#fca5a5' }}>Lỗi: {streamError}</span>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '12px', color: '#64748b' }}>
                  Chua ket noi camera
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={confirmLoading}
                  style={{
                    background: '#22d3ee',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: confirmLoading ? 'not-allowed' : 'pointer',
                    opacity: confirmLoading ? 0.6 : 1,
                  }}
                >
                  {confirmLoading ? 'Đang kết nối...' : '▶ Xác nhận & Mở camera'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit / Config form */}
      {editing && (
        <div className="camera-form">
          <div className="camera-form-grid">
            {field('ten', 'Tên hiển thị', 'VD: Camera trước cửa sổ', true)}
            {field('ip_address', 'IP / Hostname', 'VD: 192.168.1.100')}
            {field('port', 'RTSP Port', '554')}
            {field('rtsp_path', 'RTSP Path', 'VD: /live/ch00_0')}
            {field('username', 'Username', 'VD: admin')}
            {field('password', camera.has_password ? 'Mật khẩu mới (nếu đổi)' : 'Mật khẩu', '******')}
            {field('stream_url', 'Full Stream URL (thay the IP)', 'VD: rtsp://...', true)}
          </div>
          <div className="camera-form-actions">
            <button className="btn-cancel" onClick={() => setEditing(false)}>Hủy</button>
            <button className="btn-confirm" onClick={handleUpdate} disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      )}

      {/* Zone configuration modal */}
      {zoneEditorOpen && (
        <ZoneEditor
          camera={camera}
          streamSessionId={streamSessionId}
          roomId={roomId}
          token={token}
          onClose={() => setZoneEditorOpen(false)}
          onSaved={() => {
            /* Reload zones so they appear on the main stream immediately */
            if (camera.id) {
              fetchCameraZones(roomId, camera.id, token)
                .then(r => setStreamZones(r.data.zones || []))
                .catch(() => {});
              /* Sync zones to ai_analyst (fetches correct DB-assigned IDs then POSTs) */
              axios.post(`${API_BASE}/internal/ai/zones/${camera.id}/sync`, {}, {
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => {});
            }
            onUpdate && onUpdate();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AppDisplayFieldsModal - Configure which data fields to show on mobile app */
/* ------------------------------------------------------------------ */
function AppDisplayFieldsModal({ room, devices, token, onClose, onSaved }) {
  const [selectedFields, setSelectedFields] = useState(() => {
    // Initialize from room's current app_display_fields
    const current = room?.app_display_fields;
    if (current && Array.isArray(current) && current.length > 0) {
      return new Set(current);
    }
    return null; // null means all selected
  });
  const [saving, setSaving] = useState(false);

  // Extract all unique data keys from all devices
  const allFields = React.useMemo(() => {
    const fields = [];
    const seen = new Set();
    devices.forEach(device => {
      const data = device.data || {};
      Object.keys(data).forEach(key => {
        // Skip metadata and relay keys
        if (seen.has(key)) return;
        if (key === 'device_id' || key === 'timestamp' || key.startsWith('relay_') || key.startsWith('data_relay_')) return;
        seen.add(key);
        fields.push({
          key,
          unit: data[key]?.don_vi || '',
          description: data[key]?.mo_ta || key,
        });
      });
    });
    // Sort alphabetically
    fields.sort((a, b) => a.key.localeCompare(b.key));
    return fields;
  }, [devices]);

  const handleToggle = (key) => {
    setSelectedFields(prev => {
      if (prev === null) {
        // If all selected, create new set with all except this one
        const allKeys = new Set(allFields.map(f => f.key));
        allKeys.delete(key);
        return allKeys;
      }
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedFields(null); // null = all selected
  };

  const handleClear = () => {
    setSelectedFields(new Set()); // empty set = none selected
  };

  const isSelected = (key) => {
    if (selectedFields === null) return true; // null means all
    return selectedFields.has(key);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert Set to array; null means show all (empty array in DB = show all)
      const fieldsToSave = selectedFields === null ? [] : Array.from(selectedFields);
      await axios.put(
        `${API_BASE}/rooms/${room.id}`,
        { app_display_fields: fieldsToSave.length > 0 ? fieldsToSave : null },
        hdr(token)
      );
      onSaved && onSaved(fieldsToSave);
      onClose();
    } catch (e) {
      alert('Lỗi lưu cấu hình: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = selectedFields === null ? allFields.length : selectedFields.size;

  return (
    <div className="app-display-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-display-modal">
        <div className="app-display-modal-header">
          <h3>Cấu hình hiển thị trên App</h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--rd-btn-text)', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        <div className="app-display-modal-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--rd-text-muted)', marginBottom: 12 }}>
            Tick chon cac truong du lieu se hien thi tren App mobile. Bo trong de hien thi tat ca.
          </p>
          <div className="app-display-actions">
            <button className="btn-select-all" onClick={handleSelectAll}>Chon tat ca</button>
            <button className="btn-clear" onClick={handleClear}>Bo chon tat ca</button>
            <span style={{ marginLeft: 'auto' }}>{selectedCount}/{allFields.length} duoc chon</span>
          </div>
          {allFields.length === 0 ? (
            <div className="app-display-no-fields">
              Không có trường dữ liệu nào. Vui lòng thêm thiết bị vào phòng trước.
            </div>
          ) : (
            allFields.map(field => (
              <div key={field.key} className="app-display-field-item">
                <input
                  type="checkbox"
                  checked={isSelected(field.key)}
                  onChange={() => handleToggle(field.key)}
                />
                <span className="app-display-field-name">{field.key}</span>
                {field.unit && <span className="app-display-field-unit">({field.unit})</span>}
              </div>
            ))
          )}
        </div>
        <div className="app-display-modal-footer">
          <button className="btn-cancel-app-display" onClick={onClose}>Hủy</button>
          <button className="btn-save-app-display" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RoomDetail main component                                            */
/* ------------------------------------------------------------------ */
export default function RoomDetail({ roomId, token, onBack, workspaceContext }) {
  // Global cache — rooms list từ cache để hydrate header ngay
  const { cache } = useGlobalCache();
  const [room, setRoom] = useState(null);
  const [devices, setDevices] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  // Số người tức thời từ CameraCard (AI đang chạy), đồng bộ với banner nhanh hơn poll DB
  const [liveOccupancy, setLiveOccupancy] = useState(null);
  // Cùng nguồn với poll /sessions/.../status (1s) — tránh banner số động mà "Cập nhật" đứng im
  const [liveOccupancyAt, setLiveOccupancyAt] = useState(null);

  const handleCameraPeopleCount = useCallback((count) => {
    setLiveOccupancy(count);
    setLiveOccupancyAt(new Date());
  }, []);

  // Banner: ưu tiên liveOccupancy (từ AI session đang chạy), fallback occupancy từ API
  const bannerCount = liveOccupancy !== null ? liveOccupancy : (occupancy?.so_nguoi ?? '—');
  const [loading, setLoading] = useState(false); // false = không block toàn trang
  const [initialLoading, setInitialLoading] = useState(true); // chỉ cho lần đầu
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAppDisplayFields, setShowAppDisplayFields] = useState(false);
  const [addForm, setAddForm] = useState({
    ten: '',
    ip_address: '',
    port: 554,
    rtsp_path: '',
    username: '',
    password: '',
    stream_url: '',
  });

  const _cacheKey = `room_detail_${roomId}`;

  const loadData = useCallback(async () => {
    try {
      const [roomRes, devRes, camRes, occRes] = await Promise.all([
        axios.get(`${API_BASE}/rooms/${roomId}`, hdr(token)),
        fetchRoomDeviceData(roomId, token).catch(() => ({ data: { devices: [] } })),
        fetchRoomCameras(roomId, token).catch(() => ({ data: { cameras: [] } })),
        fetchRoomOccupancy(roomId, token).catch(() => ({ data: { so_nguoi: 0 } })),
      ]);
      setRoom(roomRes.data);
      setDevices(devRes.data.devices || []);
      setCameras(camRes.data.cameras || []);
      setOccupancy(occRes.data);
      // Cache vào sessionStorage để lần sau vào thấy ngay
      try {
        sessionStorage.setItem(_cacheKey, JSON.stringify({
          room: roomRes.data,
          devices: devRes.data.devices || [],
          cameras: camRes.data.cameras || [],
          occupancy: occRes.data,
          ts: Date.now(),
        }));
      } catch (_) { /* quota exceeded */ }
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setInitialLoading(false);
    }
  }, [roomId, token]);

  // Hydrate room name ngay từ global cache — hiển thị header tức thì
  useEffect(() => {
    if (!cache.rooms?.length) return;
    const found = cache.rooms.find(r => String(r.id) === String(roomId));
    if (found && !room) {
      setRoom(found);
    }
  }, [cache.rooms, roomId]);

  // Hydrate từ sessionStorage trước khi fetch
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(_cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Date.now() - (cached.ts || 0) < 60_000) {
          setRoom(prev => prev || cached.room);
          setDevices(cached.devices || []);
          setCameras(cached.cameras || []);
          setOccupancy(cached.occupancy);
          setInitialLoading(false); // hiển thị ngay, fetch ngầm
          loadData(); // refresh ngầm
          return;
        }
      }
    } catch (_) { /* parse error */ }
    loadData();
  }, [loadData]);

  /* poll occupancy every 3s */
  useEffect(() => {
    const id = setInterval(async () => {
      const r = await fetchRoomOccupancy(roomId, token).catch(() => ({ data: { so_nguoi: 0 } }));
      setOccupancy(r.data);
    }, 3000);
    return () => clearInterval(id);
  }, [roomId, token]);

  const handleDeleteCamera = async (cameraId) => {
    if (!window.confirm('Xóa camera này?')) return;
    try {
      await deleteRoomCamera(roomId, cameraId, token);
      setCameras(cs => cs.filter(c => c.id !== cameraId));
      try { sessionStorage.removeItem(_cacheKey); } catch (_) {}
    } catch (e) {
      alert('Lỗi xóa: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleAddCamera = async () => {
    try {
      await createRoomCamera(roomId, {
        ...addForm,
        port: Number(addForm.port) || 554,
        thu_tu: cameras.length,
      }, token);
      setShowAdd(false);
      setAddForm({ ten: '', ip_address: '', port: 554, rtsp_path: '', username: '', password: '', stream_url: '' });
      try { sessionStorage.removeItem(_cacheKey); } catch (_) {}
      loadData();
    } catch (e) {
      alert('Lỗi tạo camera: ' + (e.response?.data?.detail || e.message));
    }
  };

  if (initialLoading) {
    return (
      <div className="room-detail-page">
        <p style={{ color: '#94a3b8' }}>Đang tải...</p>
      </div>
    );
  }
  if (error) return <div className="room-detail-page"><p style={{ color: '#fca5a5' }}>{error}</p><button onClick={onBack}>Quay lại</button></div>;

  return (
    <div className="room-detail-page">
      {/* Header */}
      <div className="room-detail-header">
        <div className="room-detail-header-left">
          <button
            className="room-detail-btn"
            onClick={() => { window.location.hash = '#/rooms'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Quay lại Quản lý phòng
          </button>
          <div className="room-detail-title-row">
            <h1 className="room-detail-title">{room?.ten_phong || `Phòng #${roomId}`}</h1>
          </div>
          {(room?.vi_tri || room?.mo_ta) && (
            <div className="room-detail-meta">
              {room?.vi_tri && <span>{room.vi_tri}</span>}
              {room?.vi_tri && room?.mo_ta && <span> • </span>}
              {room?.mo_ta && <span>{room.mo_ta}</span>}
            </div>
          )}
        </div>
        <div className="room-detail-actions">
          <button
            className="room-detail-btn room-detail-btn-primary"
            title="Cấu hình hiển thị trên App"
            onClick={() => setShowAppDisplayFields(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            App Display
          </button>
          <button
            className="room-detail-btn room-detail-btn-icon"
            title="Full man hinh"
            onClick={() => {
              const el = document.querySelector('.room-detail-page');
              if (el && el.requestFullscreen) {
                if (!document.fullscreenElement) el.requestFullscreen();
                else document.exitFullscreen();
              }
            }}
          >
            ⛶
          </button>
        </div>
      </div>

      <div className="room-detail-content">
        {/* Occupancy banner */}
        <div className="room-occupancy-banner">
          <div className="room-occupancy-count">{bannerCount}</div>
          <div className="room-occupancy-label">
            <span className="room-occupancy-label-text">nguoi trong phong</span>
            {(liveOccupancy !== null && liveOccupancyAt) || occupancy?.cap_nhat_luc ? (
              <span className="room-occupancy-label-time">
                Cập nhật: {(liveOccupancy !== null && liveOccupancyAt ? liveOccupancyAt : new Date(occupancy.cap_nhat_luc)).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>

        {/* Devices */}
        <div className="room-detail-devices">
          <div className="room-detail-section-header">
            <h3 className="room-detail-section-title">
              Thiết bị
              <span className="room-detail-section-badge">{devices.length}</span>
            </h3>
          </div>
          {devices.length === 0 ? (
            <p className="no-device">Chua co thiet bi nao</p>
          ) : (
            <div className="device-chips-container">
              {devices.map(d => (
                <div key={d.id} className="device-chip">
                  <span className={`status-dot ${d.trang_thai === 'online' ? 'status-online' : 'status-offline'}`}></span>
                  {d.ten_thiet_bi || d.ma_thiet_bi}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cameras */}
        <div className="room-detail-section">
          <div className="room-detail-section-header">
            <h3 className="room-detail-section-title">
              Camera
              <span className="room-detail-section-badge">{cameras.length}</span>
            </h3>
          </div>
          <div className="camera-grid">
            {cameras.map(cam => (
              <CameraCard
                key={cam.id}
                camera={cam}
                roomId={roomId}
                token={token}
                onDelete={handleDeleteCamera}
                onUpdate={loadData}
                onPeopleCount={handleCameraPeopleCount}
              />
            ))}

            {/* Add camera card */}
            {!showAdd ? (
              <button className="btn-add-camera" onClick={() => setShowAdd(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Thêm Camera
              </button>
            ) : (
              <div className="camera-card">
                <div className="camera-card-header">
                  <div className="cam-title">Thêm Camera Mới</div>
                  <button className="room-detail-btn room-detail-btn-icon" onClick={() => setShowAdd(false)}>×</button>
                </div>
                <div className="camera-form">
                  <div className="camera-form-grid">
                    <div className="full">
                      <label>Tên hiển thị</label>
                      <input placeholder="VD: Camera trước cửa sổ"
                        value={addForm.ten} onChange={e => setAddForm(f => ({ ...f, ten: e.target.value }))} />
                    </div>
                    <div>
                      <label>IP / Hostname</label>
                      <input placeholder="VD: 192.168.1.100"
                        value={addForm.ip_address} onChange={e => setAddForm(f => ({ ...f, ip_address: e.target.value }))} />
                    </div>
                    <div>
                      <label>RTSP Port</label>
                      <input placeholder="554"
                        value={addForm.port} onChange={e => setAddForm(f => ({ ...f, port: e.target.value }))} />
                    </div>
                    <div>
                      <label>RTSP Path</label>
                      <input placeholder="VD: /live/ch00_0"
                        value={addForm.rtsp_path} onChange={e => setAddForm(f => ({ ...f, rtsp_path: e.target.value }))} />
                    </div>
                    <div>
                      <label>Username</label>
                      <input placeholder="VD: admin"
                        value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                    </div>
                    <div>
                      <label>Mật khẩu</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="******"
                          value={addForm.password}
                          onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                          style={{ paddingRight: '40px', width: '100%' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          style={{
                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          title={showPassword ? 'An mat khau' : 'Hien mat khau'}
                        >
                          {showPassword ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="full">
                      <label>Full Stream URL (thay the IP/port/path)</label>
                      <input placeholder="VD: rtsp://user:pass@192.168.1.100:554/stream"
                        value={addForm.stream_url} onChange={e => setAddForm(f => ({ ...f, stream_url: e.target.value }))} />
                    </div>
                  </div>
                  <div className="camera-form-actions">
                    <button className="btn-cancel" onClick={() => setShowAdd(false)}>Hủy</button>
                    <button className="btn-confirm" onClick={handleAddCamera}>Lưu</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* App Display Fields Modal */}
        {showAppDisplayFields && (
          <AppDisplayFieldsModal
            room={room}
            devices={devices}
            token={token}
            onClose={() => setShowAppDisplayFields(false)}
            onSaved={(fields) => {
              setRoom(prev => prev ? { ...prev, app_display_fields: fields } : prev);
              try { sessionStorage.removeItem(_cacheKey); } catch (_) {}
              loadData();
            }}
          />
        )}
      </div>
    </div>
  );
}
