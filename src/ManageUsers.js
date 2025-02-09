import React, { useEffect, useState } from 'react';
import axios from 'axios';
import config from './config';
import './ManageUsers.css';

function ManageUsers({ adminToken }) {
  const [users, setUsers] = useState([]);
  const [userRequests, setUserRequests] = useState([]);
  const [error, setError] = useState('');
  const [editingRequest, setEditingRequest] = useState({ id: null, response: '' });

  useEffect(() => {
    fetchUsers();
    fetchUserRequests();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${config.api.baseUrl}/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setUsers(response.data.users);
    } catch (err) {
      setError('Failed to fetch users.');
    }
  };

  const fetchUserRequests = async () => {
    try {
      const response = await axios.get(`${config.api.baseUrl}/user-requests`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setUserRequests(response.data.userRequests);
    } catch (err) {
      setError('Failed to fetch user requests.');
    }
  };

  const handleStatusChange = async (userId, action) => {
    const newStatus = action === 'approve' ? 'approved' : 'reverted';
    try {
      await axios.post(
        `${config.api.baseUrl}/admin/approve-revert`,
        { userId, action },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      setUsers(users.map(user => user.id === userId ? { ...user, approval_status: newStatus } : user));
    } catch (err) {
      setError('Failed to update user status.');
    }
  };

  const handleAdminResponseChange = (id, response) => {
    setEditingRequest({ id, response });
  };

  const saveAdminResponse = async (id) => {
    try {
      await axios.put(
        `${config.api.baseUrl}/user-requests/${id}/admin-response`,
        { adminResponse: editingRequest.response },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      setEditingRequest({ id: null, response: '' });
      fetchUserRequests(); // Refresh the user requests
    } catch (err) {
      setError('Failed to save admin response.');
    }
  };

  return (
    <div className="manage-users">
      <h2>Manage Users</h2>
      {error && <p className="error">{error}</p>}

      <ul className="user-list">
        {users.map(user => (
          <li key={user.id} className="user-item">
            <span className="username">{user.username}</span>
            <span className={`status ${user.approval_status}`}>
              Status: {user.approval_status.charAt(0).toUpperCase() + user.approval_status.slice(1)}
            </span>
            <div className="action-buttons">
              <button onClick={() => handleStatusChange(user.id, 'approve')} className="approve-button">Approve</button>
              <button onClick={() => handleStatusChange(user.id, 'revert')} className="revert-button">Revert</button>
            </div>
          </li>
        ))}
      </ul>

      <h2>Manage User Requests</h2>
      <ul className="request-list">
        {userRequests.map(request => (
          <li key={request.id} className="request-item">
            <p><strong>Username:</strong> {request.username}</p>
            <p><strong>Question:</strong> {request.question}</p>
            <p><strong>ChatGPT Response:</strong> {request.chatGPTResponse}</p>
            <p><strong>Feedback:</strong> {request.feedback || 'No feedback submitted'}</p>
            <p>
              <strong>Admin Response:</strong> 
              {editingRequest.id === request.id ? (
                <textarea
                  value={editingRequest.response}
                  onChange={(e) => handleAdminResponseChange(request.id, e.target.value)}
                />
              ) : (
                request.adminResponse || 'No response yet'
              )}
            </p>
            {editingRequest.id === request.id ? (
              <button onClick={() => saveAdminResponse(request.id)} className="save-button">Save</button>
            ) : (
              <button onClick={() => handleAdminResponseChange(request.id, request.adminResponse || '')} className="edit-button">Edit</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ManageUsers;
