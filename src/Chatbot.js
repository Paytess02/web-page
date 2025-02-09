import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import config from "./config";

function Chatbot({ token, username }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [approvalStatus, setApprovalStatus] = useState("pending"); // 'pending', 'approved', 'denied'
  const [feedback, setFeedback] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [requestId, setRequestId] = useState(null); // ID of the logged user request
  const chatWindowRef = useRef(null);

  // Automatically scroll to the bottom of the chat window on new messages
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  // Fetch chatbot access approval status on load
  useEffect(() => {
    checkApprovalStatus();
  }, []);

  const checkApprovalStatus = async () => {
    try {
      const response = await axios.get(config.api.chatbotAccessUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApprovalStatus(response.data.message === "Access granted" ? "approved" : "denied");
    } catch (error) {
      if (error.response?.status === 403) {
        setApprovalStatus("denied");
        alert("Access to chatbot denied by admin.");
      } else {
        console.error("Error fetching approval status:", error.message);
      }
    }
  };

  const handleSendMessage = async () => {
    const userMessage = { text: input, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const userInput = input;
    setInput(""); // Clear the input field
    let botReply = config.chatbot.defaultBotReply;

    try {
      const response = await axios.post(
        config.api.chatApiUrl,
        { message: userInput },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      botReply = response.data.reply || config.chatbot.defaultBotReply;
      setMessages((prevMessages) => [...prevMessages, { text: botReply, sender: "bot" }]);

      const logResponse = await axios.post(
        config.api.userRequestApiUrl,
        {
          username,
          question: userInput,
          chatGPTResponse: botReply,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRequestId(logResponse.data.requestId); // Store the request ID
      setShowFeedbackForm(true); // Show the feedback form after response
    } catch (error) {
      console.error("Error during chatbot interaction:", error.message);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedback || !requestId) return;

    try {
      await axios.put(
        `${config.api.userRequestApiUrl}/${requestId}/feedback`,
        { feedback },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert("Thank you for your feedback!");
      setShowFeedbackForm(false);
      setFeedback("");
    } catch (error) {
      console.error("Error submitting feedback:", error.message);
    }
  };

  const handleConnectWithAdmin = async () => {
    try {
      await axios.put(
        `${config.api.userRequestApiUrl}/${requestId}/admin-response`,
        { adminResponse: "User requested admin assistance" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert("Admin has been notified. They will review your query.");
    } catch (error) {
      console.error("Error notifying admin:", error.message);
    }
  };

  return (
    <div className="chatbot">
      <div className="welcome-message">{config.chatbot.welcomeMessage}</div>

      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.sender}`}>
            <p>{msg.text}</p>
          </div>
        ))}
      </div>

      {approvalStatus === "pending" && (
        <p className="status-message">Waiting for admin approval to access chatbot...</p>
      )}
      {approvalStatus === "denied" && (
        <p className="status-message">Chatbot access denied by admin. Please contact support.</p>
      )}

      {approvalStatus === "approved" && (
        <div className="chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={config.chatbot.placeholder}
          />
          <button onClick={handleSendMessage} className="send-button">
            Send
          </button>
        </div>
      )}

      {showFeedbackForm && (
        <div className="feedback-form">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Enter your feedback..."
          />
          <button onClick={handleSubmitFeedback}>Submit Feedback</button>
          <button onClick={handleConnectWithAdmin}>Connect with Admin</button>
        </div>
      )}
    </div>
  );
}

export default Chatbot;
