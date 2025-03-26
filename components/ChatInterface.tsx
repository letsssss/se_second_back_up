"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
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
  onMarkAsRead?: () => Promise<boolean>;
}

export function ChatInterface({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSendMessage,
  otherUserName,
  otherUserProfileImage = '/placeholder.svg',
  otherUserRole,
  onMarkAsRead
}: ChatInterfaceProps) {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // 이전 메시지 수를 기록하기 위한 ref를 최상위 레벨로 이동
  const prevMessagesLengthRef = useRef<number>(0);
  // 마지막으로 확인한 읽지 않은 메시지 수를 저장하는 ref (최상위 레벨로 이동)
  const lastUnreadCountRef = useRef<number>(0);
  // 초기 로딩 상태를 추적하는 state 추가
  const [initialLoading, setInitialLoading] = useState(true);

  // 메시지가 로드되면 초기 로딩 상태를 false로 설정
  useEffect(() => {
    if (messages.length > 0 && initialLoading) {
      setInitialLoading(false);
    }
  }, [messages, initialLoading]);

  // 메시지 읽음 처리 함수
  const markMessagesAsRead = useCallback(() => {
    // 읽지 않은 메시지가 있고, 읽음 처리 함수가 있는 경우에만 호출
    const hasUnreadMessages = messages.some(msg => !msg.isMine && !msg.isRead);
    const unreadMessages = messages.filter(msg => !msg.isMine && !msg.isRead);
    
    console.log('[ChatInterface] 읽음 처리 검사:', {
      hasUnreadMessages,
      messagesCount: messages.length,
      unreadCount: unreadMessages.length,
      unreadMessages: unreadMessages.map(m => ({id: m.id, text: m.text.substring(0, 10)})),
      hasMarkAsReadFunction: !!onMarkAsRead
    });
    
    if (hasUnreadMessages && onMarkAsRead) {
      console.log('[ChatInterface] 읽음 처리 함수 호출 시도');
      onMarkAsRead().then(result => {
        console.log('[ChatInterface] 읽음 처리 결과:', result);
        // 읽음 처리 후 메시지 상태를 강제로 확인
        const currentUnread = messages.filter(msg => !msg.isMine && !msg.isRead);
        console.log('[ChatInterface] 읽음 처리 후 읽지 않은 메시지:', currentUnread.length);
      }).catch(err => {
        console.error('[ChatInterface] 읽음 표시 실패:', err);
      });
    }
  }, [messages, onMarkAsRead]);

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

  // 스크롤을 맨 아래로 이동하는 함수
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  // 채팅창이 처음 열리거나 메시지가 로드된 후 스크롤을 하단으로 이동
  useEffect(() => {
    if (isOpen && !isLoading && messages.length > 0) {
      console.log('[ChatInterface] 채팅창 열림/메시지 로드 완료, 스크롤 조정');
      // 메시지가 로드된 직후 항상 스크롤을 맨 아래로 이동
      requestAnimationFrame(() => {
        scrollToBottom();
      });
      
      // 메시지 읽음 처리
      markMessagesAsRead();
    }
  }, [isOpen, isLoading, messages, scrollToBottom, markMessagesAsRead]);

  // 채팅창이 열려있는 상태에서 주기적으로 메시지 확인 및 읽음 처리
  useEffect(() => {
    if (isOpen) {
      console.log('[ChatInterface] 주기적 메시지 확인 타이머 설정');
      
      // 현재 읽지 않은 메시지 수로 ref 업데이트
      lastUnreadCountRef.current = messages.filter(msg => !msg.isMine && !msg.isRead).length;
      
      // 주기적으로 메시지 확인 및 읽음 처리
      const checkInterval = setInterval(() => {
        // 현재 읽지 않은 메시지 수 계산
        const currentUnreadCount = messages.filter(msg => !msg.isMine && !msg.isRead).length;
        
        // 읽지 않은 메시지 수가 변경되었을 때만 로그 출력 및 처리
        if (currentUnreadCount > 0 && currentUnreadCount !== lastUnreadCountRef.current) {
          console.log('[ChatInterface] 읽지 않은 메시지 발견, 읽음 처리 실행');
          markMessagesAsRead();
          // 마지막으로 확인한 읽지 않은 메시지 수 업데이트
          lastUnreadCountRef.current = currentUnreadCount;
        }
      }, 5000); // 5초마다 확인 (더 낮은 빈도로 변경)
      
      return () => {
        console.log('[ChatInterface] 주기적 메시지 확인 타이머 정리');
        clearInterval(checkInterval);
      };
    }
  }, [isOpen, messages, markMessagesAsRead]);

  // 메시지 목록이 변경되면 스크롤 위치를 조정합니다
  useEffect(() => {
    // 새 메시지가 추가된 경우에만 스크롤 처리
    if (messages.length > prevMessagesLengthRef.current) {
      console.log('[ChatInterface] 새 메시지 감지, 총 메시지 수:', messages.length);
      requestAnimationFrame(() => {
        scrollToBottom();
      });
      
      // 새 메시지가 추가되었을 때 읽음 처리
      markMessagesAsRead();
    }
    
    // 현재 메시지 수 업데이트
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom, markMessagesAsRead]);

  // 글로벌 스크롤 이벤트 리스너 추가
  useEffect(() => {
    // 커스텀 이벤트 타입 정의
    type ScrollEventDetail = {
      smooth?: boolean;
    };

    const handleScrollToBottom = (e: Event) => {
      if (messagesEndRef.current) {
        // 타입 캐스팅
        const customEvent = e as CustomEvent<ScrollEventDetail>;
        const smooth = customEvent.detail?.smooth === true;
        
        messagesEndRef.current.scrollIntoView({ 
          behavior: smooth ? 'smooth' : 'auto',
          block: 'end'
        });
      }
    };

    window.addEventListener('chat:scrollToBottom', handleScrollToBottom);
    
    return () => {
      window.removeEventListener('chat:scrollToBottom', handleScrollToBottom);
    };
  }, []);

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
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 flex flex-col"
        >
          {isLoading && initialLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-gray-500">메시지를 불러오는 중...</div>
            </div>
          ) : (
            <>
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-4 mt-auto">
                  메시지가 없습니다. 첫 메시지를 보내보세요!
                </div>
              ) : (
                <div className="space-y-4 flex flex-col mt-auto">
                  {messages.map((message) => (
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
                                  : message.status === 'sent'
                                    ? '전송됨' 
                                    : ''}
                            </span>
                          )}
                          {/* 읽음 상태 표시 - 로그 추가 */}
                          {message.isMine && (
                            console.log('[ChatInterface] 메시지 상태:', {
                              id: message.id,
                              isRead: message.isRead,
                              text: message.text.substring(0, 10)
                            }),
                            message.isRead && (
                              <span className="text-xs text-teal-300 font-medium">
                                읽음
                              </span>
                            )
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
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </>
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