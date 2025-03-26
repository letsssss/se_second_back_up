"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { X, Send } from 'lucide-react';
import { Message } from '@/hooks/useChat';

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => Promise<boolean>;
  otherUserName: string;
  otherUserProfileImage?: string;
  otherUserRole: string;
}

export function ChatInterface({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSendMessage,
  otherUserName,
  otherUserProfileImage = '/placeholder.svg',
  otherUserRole
}: ChatInterfaceProps) {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 전송 처리
  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || isSending) return;
    
    setIsSending(true);
    const messageContent = newMessage;
    setNewMessage(''); // 즉시 입력창 클리어
    
    try {
      await onSendMessage(messageContent);
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      alert('메시지 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSending(false);
    }
  };

  // 엔터 키 처리
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 메시지 시간 포맷팅
  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // 메시지가 변경될 때 스크롤을 아래로 이동
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 스크롤을 맨 아래로 이동하는 함수
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 채팅창이 열릴 때 스크롤을 아래로 이동
  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100); // 약간의 지연을 두어 UI가 완전히 렌더링된 후 스크롤
    }
  }, [isOpen]);

  // 채팅창이 닫혀있으면 아무것도 렌더링하지 않음
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        {/* 채팅 헤더 */}
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden">
              <Image
                src={otherUserProfileImage}
                alt={otherUserName}
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h3 className="font-medium">{otherUserName}</h3>
              <p className="text-xs text-gray-500">{otherUserRole}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 채팅 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-gray-500">메시지를 불러오는 중...</div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  메시지가 없습니다. 첫 메시지를 보내보세요!
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.clientId || message.id}
                    className={`flex ${message.isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        message.isMine
                          ? 'bg-teal-500 text-white rounded-tr-none'
                          : 'bg-gray-200 text-gray-800 rounded-tl-none'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        {message.status && (
                          <span 
                            className={`text-xs ${
                              message.isMine 
                                ? message.status === 'failed' 
                                  ? 'text-red-300' 
                                  : message.status === 'sending' 
                                    ? 'text-teal-200' 
                                    : 'text-teal-100'
                                : 'text-gray-500'
                            }`}
                          >
                            {message.status === 'failed' 
                              ? '전송 실패' 
                              : message.status === 'sending' 
                                ? '전송 중...' 
                                : ''}
                          </span>
                        )}
                        <span
                          className={`text-xs ${
                            message.isMine ? 'text-teal-100' : 'text-gray-500'
                          }`}
                        >
                          {formatMessageTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 메시지 입력 영역 */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="메시지를 입력하세요..."
              disabled={isSending}
              className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSending || newMessage.trim() === ''}
              className={`p-2 rounded-full transition-colors ${
                isSending || newMessage.trim() === ''
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              }`}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 