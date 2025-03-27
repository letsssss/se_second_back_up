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
  // 입력 타이머 추적
  const inputTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 마지막 입력 시간
  const lastInputTimeRef = useRef<number>(0);
  // 입력 관련 상태 및 참조 추가
  const minimumInputDelayRef = useRef<number>(300); // 최소 입력 지연 시간 (300ms)
  const inputValueRef = useRef<string>('');

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
    
    // 읽을 메시지가 없으면 함수 실행 안함
    if (!hasUnreadMessages) {
      console.log('[ChatInterface] 읽을 메시지가 없어서 읽음 처리 건너뜀');
      return;
    }
    
    // 읽음 처리 함수가 없으면 실행 안함
    if (!onMarkAsRead) {
      console.log('[ChatInterface] 읽음 처리 함수가 제공되지 않음');
      return;
    }
    
    // 메시지가 있고 처리 함수가 있는 경우에만
    console.log('[ChatInterface] 읽음 처리 함수 호출 시도');
    
    // 딜레이를 준 후 실행 (roomId와 userId가 설정될 시간을 줌)
    setTimeout(() => {
      onMarkAsRead().then(result => {
        console.log('[ChatInterface] 읽음 처리 결과:', result);
        // 읽음 처리 후 메시지 상태를 강제로 확인
        const currentUnread = messages.filter(msg => !msg.isMine && !msg.isRead);
        console.log('[ChatInterface] 읽음 처리 후 읽지 않은 메시지:', currentUnread.length);
      }).catch(err => {
        console.error('[ChatInterface] 읽음 표시 실패:', err);
      });
    }, 500); // 0.5초 딜레이
  }, [messages, onMarkAsRead]);

  // 입력 상태 변경 처리
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // 현재 시간 기록
    const now = Date.now();
    const value = e.target.value;
    
    // 입력 값 참조에 저장
    inputValueRef.current = value;
    
    // 값 즉시 업데이트 (UI 반응성 유지)
    setNewMessage(value);
    
    // 마지막 입력 시간과 현재 시간의 차이가 최소 입력 지연 시간보다 작으면 타이머 리셋만 함
    // 이렇게 하면 빠르게 타이핑할 때 이벤트가 너무 자주 발생하는 것을 방지
    const timeSinceLastInput = now - lastInputTimeRef.current;
    if (timeSinceLastInput < minimumInputDelayRef.current) {
      // 기존 타이머 취소
      if (inputTimerRef.current) {
        clearTimeout(inputTimerRef.current);
        inputTimerRef.current = null;
      }
      
      // 새 타이머 설정 (지연 발송)
      inputTimerRef.current = setTimeout(() => {
        dispatchTypingEvent(true, inputValueRef.current);
        inputTimerRef.current = null;
      }, minimumInputDelayRef.current);
      
      return;
    }
    
    // 최소 지연 시간 이후의 입력이면 시간 기록 및 타이핑 이벤트 발생
    lastInputTimeRef.current = now;
    
    // 기존 타이머 취소
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
    
    // 타이핑 중 이벤트 발생
    dispatchTypingEvent(true, value);
    
    // 타이핑 종료 지연 타이머 설정 (5초로 확장)
    inputTimerRef.current = setTimeout(() => {
      console.log('[ChatInterface] 타이핑 종료 이벤트 발생');
      dispatchTypingEvent(false, value);
      inputTimerRef.current = null;
    }, 5000); // 5초 동안 입력이 없으면 타이핑 종료로 간주
  }, []);
  
  // 타이핑 이벤트 발송 함수 분리 (재사용성 및 일관성)
  const dispatchTypingEvent = useCallback((isTyping: boolean, inputValue: string) => {
    if (typeof window !== 'undefined') {
      console.log(`[ChatInterface] ${isTyping ? '타이핑 중' : '타이핑 종료'} 이벤트 발생`, { 
        timestamp: Date.now(),
        inputLength: inputValue.length
      });
      
      window.dispatchEvent(new CustomEvent('chat:typing', {
        detail: { 
          isTyping, 
          timestamp: Date.now(),
          inputValue
        }
      }));
    }
  }, []);

  // 메시지 전송 처리
  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || isSending) return;

    setIsSending(true);
    const messageContent = newMessage;
    setNewMessage(''); // 즉시 입력창 클리어
    inputValueRef.current = ''; // 참조 값도 클리어
    
    // 타이핑 종료 이벤트 즉시 발송
    dispatchTypingEvent(false, '');
    
    // 기존 타이머 취소
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
    
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
      
      // 주기적으로 메시지 확인 및 읽음 처리 (15초로 늘림)
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
      }, 15000); // 15초마다 확인으로 변경
      
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
              onChange={handleInputChange}
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