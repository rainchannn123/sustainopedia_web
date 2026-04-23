function saveChatHistory(history) {
    localStorage.setItem('chatHistory', JSON.stringify(history));
}

function loadChatHistory() {
    const history = localStorage.getItem('chatHistory');
    return history ? JSON.parse(history) : {};
}

function addMessage(header, message) {
    const chatHistory = loadChatHistory();
    chatHistory[header].push(message);
    saveChatHistory(chatHistory);
}
