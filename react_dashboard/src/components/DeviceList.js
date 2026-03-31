import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';

const DeviceList = () => {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setDevices(res.data.devices))
      .catch(err => console.error('Error fetching devices', err));
  }, []);

  return (
    <div>
      <h3>Danh sách thiết bị</h3>
      <ul>
        {devices.map(id => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </div>
  );
};

export default DeviceList;
