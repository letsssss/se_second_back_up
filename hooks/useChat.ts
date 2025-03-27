import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket, io } from 'socket.io-client';

// 인증 토큰을 가져오는 함수
const getAuthToken = (): string => {
  if (typeof window === 'undefined') return '';
  
  try {
    // auth-token을 먼저 확인하고, 없으면 token을 확인
    const token = localStorage.getItem('auth-token') || localStorage.getItem('token') || '';
    return token;
  } catch (error) {
    console.error('인증 토큰 가져오기 실패:', error);
    return '';
  }
};

// 메시지 인터페이스 정의
export interface Message {
  id: string;
  clientId?: string;
  senderId: string;
  receiverId?: string;
  text: string;
  timestamp: string;
  isMine: boolean;
  status?: 'sending' | 'sent' | 'failed';
  isRead?: boolean;
  roomId?: string;
}

// useChat 훅의 옵션
export interface ChatOptions {
  userId?: string;
  transactionId?: string;
  otherUserId?: string;
  userRole?: 'buyer' | 'seller' | 'user';
}

// 훅 반환 타입
export interface ChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  socketConnected: boolean;
  sendMessage: (content: string) => Promise<boolean>;
  fetchMessages: (options?: { force?: boolean, forceScrollToBottom?: boolean }) => Promise<boolean>;
  roomId: string | null;
  transactionInfo: any | null;
  otherUserInfo: any | null;
  conversations: any[];
  hasMore: boolean;
  markMessagesAsRead: () => Promise<boolean>;
}

// 로컬 스토리지에서 사용자 정보 가져오기 함수
const getUserFromLocalStorage = (): { id?: number, name?: string } => {
  if (typeof window === 'undefined') return {};
  
  try {
    const userString = localStorage.getItem('user');
    if (!userString) return {};
    
    const user = JSON.parse(userString);
    return user;
  } catch (error) {
    console.error('로컬 스토리지에서 사용자 정보를 불러오는 중 오류 발생:', error);
    return {};
  }
};

// 채팅 커스텀 훅
export function useChat(options: ChatOptions | null = null): ChatReturn {
  // 상태 관리
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketConnectionFailed, setSocketConnectionFailed] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<any | null>(null);
  const [otherUserInfo, setOtherUserInfo] = useState<any | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  // 마지막 메시지 ID를 저장하는 상태 추가
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  // 폴링 간격을 저장하는 ref (ms 단위)
  const pollingIntervalRef = useRef<number>(30000); // 30초 유지
  // 폴링 타이머 ID를 저장하는 ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 활성 폴링 여부를 저장하는 ref
  const isPollingActiveRef = useRef<boolean>(true);
  
  // 요청 추적용 레퍼런스
  const isRequestInProgressRef = useRef<boolean>(false);
  const lastRequestTimeRef = useRef<number>(0);
  const requestLimitTimeRef = useRef<number>(5000); // 요청 빈도 제한 (5초)
  
  // 사용자 타이핑 상태 추적 개선
  const isUserTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEventTimeRef = useRef<number>(0);
  const typingCooldownRef = useRef<number>(15000); // 타이핑 후 API 요청을 대기하는 시간 (15초)
  
  // 타이핑 차단 기능 활성화 변수 (타이핑 중 모든 API 요청 차단)
  const isTypingBlockingRef = useRef<boolean>(true);
  
  // 폴링 전환 여부를 추적하는 상태 추가
  const [useHttpPolling, setUseHttpPolling] = useState<boolean>(false);
  
  // 옵션 안전하게 추출
  const transactionId = options?.transactionId || '';
  const userId = options?.userId || '';
  const userRole = options?.userRole || 'buyer';
  const otherUserId = options?.otherUserId || '';
  
  // Socket 인스턴스와 연결 시도 카운트 참조
  const socketRef = useRef<Socket | null>(null);
  const connectionAttempts = useRef(0);
  
  // 메시지 자동 업데이트 요청 중인지 추적하는 플래그 ref
  const isUpdatingRef = useRef<boolean>(false);
  
  // 이미 처리한 클라이언트 메시지 ID 추적을 위한 ref
  const clientMessageIds = useRef<Set<string>>(new Set());
  
  // 사용자 ID를 localStorage에서 가져오기
  const [actualUserId, setActualUserId] = useState<string | null>(null);
  
  // 스크롤 관련 상태와 함수 추가
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState<boolean>(false);

  // 스크롤 이벤트 함수
  const triggerScrollToBottom = useCallback((smooth: boolean = false) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat:scrollToBottom', { 
        detail: { smooth } 
      }));
    }
  }, []);

  useEffect(() => {
    // 클라이언트 사이드에서만 실행
    if (typeof window === 'undefined') return;
    
    // 옵션이 없거나 필수 정보가 없으면 초기화하지 않음
    if (!options || !options.transactionId) {
      console.log('[useChat] 옵션이 제공되지 않았거나 거래 ID가 없음, 초기화 건너뜀');
      setIsLoading(false);
      return;
    }
    
    let id: string | null = null;
    
    try {
      // 우선 제공된 userId 사용
      if (userId) {
        id = userId;
      } else {
        // localStorage에서 사용자 정보 가져오기
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user && user.id) {
            id = user.id.toString();
          }
        }
        
        // 직접 userId 시도
        if (!id) {
          const directUserId = localStorage.getItem('userId');
          if (directUserId) {
            id = directUserId;
          }
        }
      }
    } catch (error) {
      console.error('로컬스토리지에서 사용자 ID 가져오기 실패:', error);
    }
    
    setActualUserId(id);
    console.log('[useChat] 사용자 ID 설정:', id);
  }, [userId, options]);

  // 소켓 및 타이머 관리를 위한 Ref 추가
  const socketInitializedRef = useRef(false);
  const roomJoinedRef = useRef(false);
  const handlerCountRef = useRef(0); // 디버깅용 핸들러 호출 카운터
  
  // 소켓 이벤트 핸들러 등록 전 모든 이벤트 리스너 제거
  const unregisterAllSocketEvents = useCallback((socket: Socket) => {
    if (!socket) return;
    
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');
    socket.off('reconnect');
    socket.off('reconnect_error');
    socket.off('reconnect_failed');
    socket.off('messageSent');
    socket.off('message');
    socket.off('messageReceived');
    socket.off('messageRead');
    socket.off('roomJoined');
    
    console.log('[useChat] 모든 소켓 이벤트 리스너 제거 완료');
  }, []);

  // 메시지 상태 업데이트 도우미 함수
  const updateMessageStatus = useCallback(
    (messageId: string, status: 'sending' | 'sent' | 'failed', newId?: string) => {
      setMessages((prev) =>
        prev.map((msg) => {
          // clientId나 id가 일치하는 메시지 찾기
          if (msg.id === messageId || msg.clientId === messageId) {
            // 새 ID가 제공된 경우 ID 업데이트
            return {
              ...msg,
              id: newId || msg.id,
              status
            };
          }
          return msg;
        })
      );
    },
    []
  );
  
  // 메시지 읽음 상태 업데이트 함수
  const markMessagesAsRead = useCallback(async (): Promise<boolean> => {
    // 디버깅을 위한 상세 로그 추가
    console.log('[useChat] markMessagesAsRead 호출됨, 상태:', {
      roomId,
      actualUserId,
      socketConnected,
      messagesCount: messages.length,
      unreadMessages: messages.filter(m => !m.isMine && !m.isRead)
        .map(m => ({id: m.id, text: m.text.substring(0, 15)}))
    });
    
    // 읽지 않은 메시지가 있는지 먼저 확인
    const hasUnreadMessages = messages.some(msg => !msg.isMine && !msg.isRead);
    
    // 읽지 않은 메시지가 없으면 바로 종료
    if (!hasUnreadMessages) {
      console.log('[useChat] 읽지 않은 메시지가 없어서 읽음 처리 스킵');
      return true;
    }
    
    // 재시도 기능을 위한 함수
    const attemptMarkAsRead = async (retryCount = 0, maxRetries = 3): Promise<boolean> => {
      if (!roomId || !actualUserId) {
        // roomId나 userId가 없고 재시도 횟수가 남아있는 경우
        if (retryCount < maxRetries) {
          console.log(`[useChat] roomId 또는 userId 없음, ${retryCount + 1}번째 재시도 예정...`);
          
          // 첫 번째 메시지에서 roomId 추출 시도
          if (messages.length > 0 && !roomId) {
            for (const msg of messages) {
              // 메시지 객체에 roomId가 있으면 사용
              if ((msg as any).roomId) {
                console.log('[useChat] 메시지에서 roomId 찾음:', (msg as any).roomId);
                setRoomId(String((msg as any).roomId));
                // roomId를 찾았지만 userId가 없는 경우, 다음 시도를 위해 약간의 딜레이를 줌
                if (!actualUserId) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                  return attemptMarkAsRead(retryCount + 1, maxRetries);
                }
                break;
              }
            }
          }
          
          // 잠시 기다린 후 재시도 (roomId나 userId가 설정될 시간을 줌)
          await new Promise(resolve => setTimeout(resolve, 500));
          return attemptMarkAsRead(retryCount + 1, maxRetries);
        }
        
        // 재시도 횟수를 모두 소진한 경우 메시지 기록
        console.warn('[useChat] markMessagesAsRead: 방 ID 또는 사용자 ID가 없습니다.');
        return false;
      }

      console.log('[useChat] 읽지 않은 메시지 존재 여부:', hasUnreadMessages, '전체 메시지 수:', messages.length);
      
      try {
        // 소켓 연결 상태 확인
        if (socketRef.current && socketConnected) {
          console.log('[useChat] 소켓으로 읽음 상태 업데이트 시도:', { 
            roomId, 
            userId: actualUserId 
          });
          
          try {
            socketRef.current.emit('markAsRead', {
              roomId,
              userId: actualUserId
            });
            
            // 메시지 상태 업데이트 (읽음 상태로 변경)
            setMessages(prevMessages =>
              prevMessages.map(msg => ({
                ...msg,
                isRead: msg.isMine ? msg.isRead : true
              }))
            );
            
            console.log('[useChat] 소켓으로 읽음 상태 업데이트 완료');
            return true;
          } catch (socketError) {
            console.error('[useChat] 소켓으로 읽음 상태 업데이트 중 오류:', socketError);
            // 소켓 오류 발생 시 HTTP API로 폴백
          }
        }
        
        // 소켓 연결이 없거나 오류 발생 시 HTTP API로 업데이트
        console.log('[useChat] HTTP API로 읽음 상태 업데이트 시도');
        
        // 인증 토큰 가져오기
        const authToken = getAuthToken();
        
        if (!authToken) {
          console.error('[useChat] 인증 토큰이 없어 메시지 읽음 처리 실패');
          return false;
        }
        
        // HTTP 요청으로 메시지 읽음 상태 업데이트
        const response = await fetch(`/api/messages/read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            roomId,
            userId: actualUserId
          })
        });
        
        if (!response.ok) {
          throw new Error(`메시지 읽음 상태 업데이트 실패: ${response.status} ${response.statusText}`);
        }
        
        // 메시지 상태 업데이트 (읽음 상태로 변경)
        setMessages(prevMessages =>
          prevMessages.map(msg => ({
            ...msg,
            isRead: msg.isMine ? msg.isRead : true
          }))
        );
        
        console.log('[useChat] HTTP API로 읽음 상태 업데이트 완료');
        return true;
      } catch (error) {
        console.error('[useChat] 메시지 읽음 상태 업데이트 중 오류:', error);
        return false;
      }
    };
    
    return attemptMarkAsRead();
  }, [roomId, actualUserId, socketConnected, messages, transactionId, otherUserId]);

  // 채팅 인터페이스 활성화 시 자동으로 메시지를 읽음 상태로 표시
  useEffect(() => {
    if (roomId && messages.length > 0 && !isLoading) {
      // 내 메시지가 아니고 읽지 않은 메시지가 있는지 확인
      const hasUnreadMessages = messages.some(msg => !msg.isMine && !msg.isRead);
      
      if (hasUnreadMessages) {
        markMessagesAsRead().catch(err => {
          console.error('[useChat] 자동 읽음 표시 실패:', err);
        });
      }
    }
  }, [roomId, messages, isLoading, markMessagesAsRead]);

  // 중복 메시지 확인 함수
  const isMessageDuplicate = useCallback((messageId: string | number, clientId?: string) => {
    return messages.some(msg => 
      (messageId && (msg.id === messageId)) || 
      (clientId && msg.clientId === clientId)
    );
  }, [messages]);

  // 사용자가 보기에 쉬운 오류 메시지 반환
  const getHumanReadableError = useCallback((error: any): string => {
    if (!error) return '알 수 없는 오류가 발생했습니다.';
    
    const errorStr = typeof error === 'string' 
      ? error 
      : error.message || JSON.stringify(error);
      
    if (errorStr.includes('인증') || errorStr.includes('auth')) {
      return '인증 오류가 발생했습니다. 로그인 상태를 확인해 주세요.';
    }
    
    if (errorStr.includes('timeout') || errorStr.includes('시간 초과')) {
      return '서버 연결 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.';
    }
    
    if (errorStr.includes('network') || errorStr.includes('네트워크')) {
      return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.';
    }
    
    return errorStr;
  }, []);

  // 메시지 목록 가져오기 함수를 먼저 선언 (순환 참조 문제 해결)
  const fetchMessages = useCallback(async (options: { force?: boolean, forceScrollToBottom?: boolean, smoothScroll?: boolean, silent?: boolean } = {}): Promise<boolean> => {
    const { force = false, forceScrollToBottom = false, smoothScroll = false, silent = false } = options;
    
    // 강제 요청이 아닌 경우 타이핑 차단 확인
    if (!force && isTypingBlockingRef.current && isUserTypingRef.current) {
      console.log('[useChat] 타이핑 중 요청 차단 (타이핑 차단 활성화)');
      return false;
    }
    
    // 중복 요청 방지 (이미 요청 중이면 무시)
    if (isRequestInProgressRef.current && !force) {
      console.log('[useChat] 이미 요청이 진행 중, 중복 요청 방지');
      return false;
    }
    
    // 타이핑 상태 및 시간 확인 로직 강화
    const now = Date.now();
    const timeSinceLastTyping = now - lastTypingEventTimeRef.current;
    
    // 타이핑 중이거나 타이핑 쿨다운 기간 내인 경우 요청 건너뜀 (강제 요청 제외)
    if (!force && (isUserTypingRef.current || timeSinceLastTyping < typingCooldownRef.current)) {
      console.log(`[useChat] 타이핑 중이거나 쿨다운 중 (${timeSinceLastTyping}ms 전 타이핑), 요청 건너뜀`);
      return false;
    }
    
    // 요청 빈도 제한 (5초 이내 중복 요청 방지, 강제 요청 제외)
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    if (!force && timeSinceLastRequest < requestLimitTimeRef.current) {
      console.log(`[useChat] 요청 빈도 제한으로 인한 스킵 (마지막 요청: ${timeSinceLastRequest}ms 전)`);
      return false;
    }
    
    // 요청 시작 표시 및 시간 기록
    console.log('[useChat] 메시지 가져오기 시작:', { force, isTyping: isUserTypingRef.current });
    isRequestInProgressRef.current = true;
    lastRequestTimeRef.current = now;
    
    // silent 옵션이 true가 아닐 때만 로딩 상태 표시
    if (!silent) {
      setIsLoading(true);
    }
    
    setError(null);
    
    try {
      console.log('[useChat] 메시지 가져오기 시도:', { 
        transactionId, 
        userId: actualUserId,
        otherUserId,
        silent
      });
      
      // HTTP API를 통해 메시지 가져오기
      const params = new URLSearchParams();
      if (transactionId) {
        params.append('purchaseId', transactionId);
      }
      if (otherUserId) {
        params.append('conversationWith', otherUserId);
      }
      
      // 캐시 방지를 위한 타임스탬프 추가
      params.append('_t', Date.now().toString());
      
      // 인증 토큰 가져오기
      const authToken = getAuthToken();
      
      console.log('[useChat] fetchMessages 인증 정보:', { 
        hasToken: !!authToken, 
        tokenLength: authToken.length,
        tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : '토큰 없음'
      });
      
      const response = await fetch(`/api/messages?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });
      
      if (!response.ok) {
        throw new Error(`메시지 가져오기 실패: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[useChat] 메시지 가져오기 결과:', {
        roomInfo: data.room ? { id: data.room.id, name: data.room.name } : null,
        messagesCount: data.messages?.length || 0,
        hasRoom: !!data.room
      });
      
      // 추가 정보 설정 - 룸 ID 설정을 메시지 처리보다 먼저 수행
      if (data.room) {
        console.log('[useChat] 룸 ID 설정:', data.room.id);
        setRoomId(data.room.id);
      } else {
        console.log('[useChat] 메시지 로드 성공했지만 룸 정보가 없음, API 응답 확인 필요');
        console.log('[useChat] data 구조:', Object.keys(data));
        
        // data에서 룸 ID를 찾을 수 있는 다른 방법 시도
        if (data.messages?.length > 0) {
          // 첫 번째 메시지 또는 첫 번째로 룸 ID가 있는 메시지에서 룸 ID 추출 시도
          for (const msg of data.messages) {
            if (msg.roomId) {
              console.log('[useChat] 메시지에서 룸 ID 추출:', msg.roomId);
              setRoomId(String(msg.roomId));
              break;
            }
          }
        } else if (transactionId) {
          // 거래 ID가 있으면 임시 룸 ID로 사용할 수 있음 (백엔드 로직에 따라 다름)
          console.log('[useChat] 거래 ID를 통한 임시 룸 ID 생성:', transactionId);
          setRoomId(`temp_room_${transactionId}`);
        }
      }
      
      if (data.messages && Array.isArray(data.messages)) {
        // 메시지 형식 변환
        const formattedMessages: Message[] = data.messages.map((msg: any) => {
          // roomId를 메시지 객체에 추가 (원본 데이터에 있는 경우)
          const roomIdFromMsg = msg.roomId ? String(msg.roomId) : undefined;
          
          return {
            id: msg.id,
            senderId: String(msg.senderId),
            receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
            text: msg.content,
            timestamp: msg.createdAt,
            isMine: String(msg.senderId) === actualUserId,
            status: 'sent',
            isRead: msg.isRead,
            roomId: roomIdFromMsg // roomId 추가
          };
        });
        
        setMessages(formattedMessages);
        
        // 메시지에서 roomId 설정이 아직 안 되었고, 메시지에 roomId가 있으면 설정
        if (!roomId && formattedMessages.length > 0) {
          for (const msg of formattedMessages) {
            if ((msg as any).roomId) {
              console.log('[useChat] 포맷된 메시지에서 룸 ID 설정:', (msg as any).roomId);
              setRoomId((msg as any).roomId);
              break;
            }
          }
        }
        
        // 최신 메시지 ID 업데이트 (마지막 메시지가 최신임)
        if (formattedMessages.length > 0) {
          const newestMessage = formattedMessages[0]; // API가 내림차순으로 반환하는 경우
          setLastMessageId(newestMessage.id);
          console.log('[useChat] 최신 메시지 ID 업데이트 (fetch):', newestMessage.id);
        }
      }
      
      if (data.transaction) {
        setTransactionInfo(data.transaction);
      }
      if (data.otherUser) {
        setOtherUserInfo(data.otherUser);
      }
      if (data.conversations) {
        setConversations(data.conversations);
      }
      if (data.hasMore !== undefined) {
        setHasMore(data.hasMore);
      }
      
      // 스크롤 이벤트 트리거
      if (forceScrollToBottom) {
        if (typeof window !== 'undefined') {
          triggerScrollToBottom(smoothScroll);
        }
      }
      
      return true;
    } catch (error: any) {
      console.error('[useChat] 메시지 가져오기 오류:', error);
      setError('메시지를 불러오는데 실패했습니다.');
      return false;
    } finally {
      // silent 옵션이 true가 아닐 때만 로딩 상태 해제
      if (!silent) {
        setIsLoading(false);
      }
      
      // 요청 완료 표시
      isRequestInProgressRef.current = false;
    }
  }, [actualUserId, transactionId, otherUserId, isLoading, triggerScrollToBottom]);

  // HTTP 폴링으로 전환하는 함수 최적화
  const switchToHttpPolling = useCallback(() => {
    // 타이핑 중이면 폴링 시작 자체를 막음
    if (isTypingBlockingRef.current && isUserTypingRef.current) {
      console.log('[useChat] 타이핑 중이므로 폴링 시작 불가');
      return;
    }
    
    // 폴링이 이미 활성화되어 있거나 소켓이 연결된 경우 중복 폴링 방지
    if (pollingTimerRef.current) {
      console.log('[useChat] 이미 폴링 중, 중복 폴링 방지');
      return;
    }
    
    if (socketConnected && socketRef.current?.connected) {
      console.log('[useChat] 소켓이 연결됨, HTTP 폴링 불필요');
      return;
    }
    
    // 기존 타이머 정리
    if (pollingTimerRef.current) {
      console.log('[useChat] 기존 폴링 타이머 제거');
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    console.log('[useChat] HTTP 폴링으로 전환합니다.');
    
    // 즉시 첫 번째 메시지를 가져옴 - 타이핑 중이 아닐 때만
    if (!isUserTypingRef.current) {
      fetchMessages({ force: true }).catch(err => 
        console.error('메시지 로드 실패:', err)
      );
    }
    
    // HTTP 폴링 상태 및 마지막 성공 시간 추적
    let lastSuccessfulPoll = Date.now();
    let consecutiveFailures = 0;
    let currentPollingInterval = pollingIntervalRef.current;
    
    // 폴링 함수 정의
    const pollFunction = () => {
      const now = Date.now();
      
      // 타이핑 차단이 활성화되어 있고 사용자가 타이핑 중이면 완전히 폴링 건너뜀
      if (isTypingBlockingRef.current && isUserTypingRef.current) {
        console.log('[useChat] 타이핑 중 폴링 차단 (타이핑 차단 활성화)');
        return;
      }
      
      // 소켓이 연결되면 폴링 중지
      if (socketConnected && socketRef.current?.connected) {
        console.log('[useChat] 소켓 연결됨, 폴링 타이머 중지');
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
        return;
      }
      
      // 타이핑 상태 및 최근 타이핑 시간 확인
      const timeSinceLastTyping = now - lastTypingEventTimeRef.current;
      if (isUserTypingRef.current || timeSinceLastTyping < typingCooldownRef.current) {
        console.log('[useChat] 사용자 타이핑 중이거나 타이핑 쿨다운 중, 폴링 건너뜀');
        return;
      }
      
      // 마지막 요청 이후 최소 간격 확인
      const timeSinceLastRequest = now - lastRequestTimeRef.current;
      if (timeSinceLastRequest < requestLimitTimeRef.current) { // 최소 5초 간격
        console.log('[useChat] 최근 요청 후 제한 시간이 지나지 않았습니다. 폴링 건너뜀');
        return;
      }
      
      // 이미 다른 요청이 처리 중인 경우
      if (isRequestInProgressRef.current) {
        console.log('[useChat] 다른 요청이 처리 중, 폴링 건너뜀');
        return;
      }
      
      console.log('[useChat] HTTP 폴링으로 메시지 업데이트 시도');
      fetchMessages({ force: true, silent: true })
        .then(success => {
          if (success) {
            lastSuccessfulPoll = now;
            consecutiveFailures = 0;
            
            // 폴링 간격 원래대로 복원 (점진적으로)
            if (currentPollingInterval > pollingIntervalRef.current) {
              currentPollingInterval = Math.max(pollingIntervalRef.current, currentPollingInterval * 0.8);
              
              // 폴링 간격 조정
              clearInterval(pollingTimerRef.current!);
              pollingTimerRef.current = setInterval(pollFunction, currentPollingInterval);
              console.log(`[useChat] 폴링 간격 감소: ${currentPollingInterval}ms`);
            }
          }
        })
        .catch(err => {
          console.error('[useChat] 폴링 메시지 로드 실패:', err);
          consecutiveFailures++;
          
          // 연속 실패 시 폴링 간격 증가 (최대 30초)
          if (consecutiveFailures > 2) {
            currentPollingInterval = Math.min(30000, currentPollingInterval * 1.5);
            
            // 폴링 간격 조정
            clearInterval(pollingTimerRef.current!);
            pollingTimerRef.current = setInterval(pollFunction, currentPollingInterval);
            console.log(`[useChat] 폴링 간격 증가: ${currentPollingInterval}ms (연속 실패: ${consecutiveFailures}회)`);
          }
        });
    };
    
    // 새 폴링 타이머 설정
    pollingTimerRef.current = setInterval(pollFunction, pollingIntervalRef.current);
    
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [fetchMessages, useHttpPolling, socketConnected]);

  // 소켓 설정 함수를 리팩토링된 코드로 교체
  const setupSocket = useCallback(() => {
    if (!actualUserId) {
      console.error('[useChat] 사용자 ID 없음 → 소켓 연결 불가');
      return;
    }

    // 기존 소켓 정리
    if (socketRef.current) {
      socketRef.current.off(); // 모든 핸들러 제거
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('[useChat] 기존 소켓 연결 해제 및 정리 완료');
    }

    const token = getAuthToken();
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'], // 폴링도 허용하여 폴백 메커니즘 추가
      reconnection: true,
      reconnectionAttempts: 15,           // 재시도 횟수 증가
      reconnectionDelay: 2000,            // 재연결 지연 시간 증가
      timeout: 30000,                     // 타임아웃 30초로 증가
      forceNew: false,                    // 기존 연결 재사용 허용
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[useChat] ✅ 소켓 연결 성공');
      setSocketConnected(true);
      setError(null);
      // 연결 성공 시 폴링 상태 해제
      setSocketConnectionFailed(false);

      if (!roomJoinedRef.current && transactionId && otherUserId) {
        socket.emit('createOrJoinRoom', {
          userId: actualUserId,
          transactionId,
          conversationWithId: otherUserId,
        });
        roomJoinedRef.current = true;
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[useChat] ⛔ 소켓 연결 해제:', reason);
      setSocketConnected(false);

      if (reason === 'io server disconnect') {
        socket.connect(); // 서버가 끊었을 때는 수동 재연결
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[useChat] ❌ 소켓 연결 실패:', err.message);
      setSocketConnected(false);
      setError('소켓 연결 실패: ' + err.message);
      
      // 즉시 HTTP 폴링으로 전환
      setSocketConnectionFailed(true);
      switchToHttpPolling();
    });

    socket.on('messageSent', (data) => {
      const newMsg = data.message;
      setMessages(prev => {
        const alreadyExists = prev.some(m => m.id === newMsg.id);
        return alreadyExists ? prev : [...prev, newMsg];
      });
    });

    // 추가 핸들러는 필요 시 여기에
  }, [actualUserId, transactionId, otherUserId, switchToHttpPolling]);

  // setupSocket 함수가 한 번만 실행되도록 관리
  useEffect(() => {
    if (!actualUserId || !transactionId || socketInitializedRef.current) return;
    
    console.log('[useChat] 소켓 초기화 시작');
    socketInitializedRef.current = true;
    roomJoinedRef.current = false;
    setupSocket();
    
    return () => {
      console.log('[useChat] 소켓 초기화 정리');
      socketInitializedRef.current = false;
      roomJoinedRef.current = false;
      
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      
      if (socketRef.current) {
        unregisterAllSocketEvents(socketRef.current);
        socketRef.current.disconnect();
      }
    };
  }, [actualUserId, transactionId, setupSocket, unregisterAllSocketEvents]);

  // 메시지 목록이 변경될 때 최신 메시지 ID 업데이트
  useEffect(() => {
    if (messages.length > 0) {
      // 메시지가 생성 시간순으로 정렬되어 있다고 가정하면 
      // 가장 최근 메시지는 배열의 마지막 요소입니다.
      const newestMessage = messages[messages.length - 1];
      if (newestMessage && newestMessage.id) {
        console.log('[useChat] 최신 메시지 ID 업데이트:', newestMessage.id, '(텍스트: ' + newestMessage.text.substring(0, 20) + '...)');
        setLastMessageId(newestMessage.id);
      }
    }
  }, [messages]);

  // 소켓 연결 상태 모니터링 및 폴링 제어
  useEffect(() => {
    console.log('[useChat] 소켓 연결 상태 변경:', socketConnected);
    
    // 소켓 연결 시 폴링 중지
    if (socketConnected && socketRef.current?.connected) {
      console.log('[useChat] 소켓 연결됨, HTTP 폴링 비활성화');
      
      // HTTP 폴링 상태 초기화
      setUseHttpPolling(false);
      
      // 기존 폴링 타이머가 있으면 제거
      if (pollingTimerRef.current) {
        console.log('[useChat] 소켓 연결로 인한 폴링 타이머 제거');
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    } else if (actualUserId && transactionId && !socketConnected) {
      // 소켓 연결이 끊어진 경우에만 HTTP 폴링 시작
      console.log('[useChat] 소켓 연결 안됨, HTTP 폴링 활성화 검토');
      
      // 이미 폴링 중이 아닌 경우에만 시작
      if (!pollingTimerRef.current && !useHttpPolling) {
        console.log('[useChat] HTTP 폴링 시작');
        isPollingActiveRef.current = true;
        switchToHttpPolling();
      }
    }
  }, [socketConnected, actualUserId, transactionId, switchToHttpPolling]);

  // 메시지 전송 실패 시 자동 재시도 기능 (1회만)
  const handleMessageSendError = useCallback(async (
    clientId: string, 
    content: string, 
    error: any
  ): Promise<boolean> => {
    console.warn('[useChat] 메시지 전송 실패, 다시 시도:', error);
    
    // 오류 메시지 설정
    setError(getHumanReadableError(error));
    
    // 실패한 메시지 상태 업데이트
    updateMessageStatus(clientId, 'failed');
    
    return false;
  }, [getHumanReadableError, updateMessageStatus]);

  // 메시지 전송 함수
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!content || !content.trim()) {
      console.error('메시지 내용이 없습니다.');
      return false;
    }
    
    if (!actualUserId) {
      console.error('사용자 ID가 설정되지 않았습니다.');
      setError('사용자 ID가 설정되지 않았습니다.');
      return false;
    }

    // 새 메시지 객체 생성
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMessage: Message = {
      id: clientId,
      clientId,
      senderId: actualUserId,
      receiverId: otherUserId || '',
      text: content,
      timestamp: new Date().toISOString(),
      isMine: true,
      status: 'sending'
    };

    // 메시지 배열에 추가
    setMessages(prev => [...prev, newMessage]);

    // 소켓 전송 시도
    try {
      // 소켓 연결 상태 확인 강화
      if (socketRef.current && socketConnected && !error) {
        console.log('[useChat] 소켓으로 메시지 전송 시도:', { 
          content, 
          senderId: actualUserId,
          receiverId: otherUserId,
          transactionId
        });
        
        // 5초 타임아웃 설정
        const socketPromise = new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('소켓 메시지 전송 시간 초과'));
          }, 5000);
          
          // 소켓 이벤트로 메시지 전송 - 안전하게 null 체크
          const socket = socketRef.current;
          if (socket) {
            socket.emit('onSend', {
              roomId: `purchase_${transactionId}`,
              chat: content,
              user: {
                id: actualUserId,
                name: '사용자'
              },
              clientId: clientId
            });
            
            console.log('[useChat] 소켓으로 메시지 전송 시도 - 상세 정보:', {
              roomId: `purchase_${transactionId}`,
              userId: actualUserId,
              clientId: clientId
            });
            
            // 응답 대기 이벤트 리스너
            const messageHandler = (response: any) => {
              clearTimeout(timeout);
              socket.off('messageSent', messageHandler);
              
              if (response.clientId === clientId || response.messageId === clientId) {
                if (response.status === 'sent' || response.status === 'success') {
                  updateMessageStatus(clientId, 'sent', response.messageId);
                  resolve(true);
                } else {
                  updateMessageStatus(clientId, 'failed');
                  reject(new Error(response.error || '메시지 전송 실패'));
                }
              }
            };
            
            socket.on('messageSent', messageHandler);
          } else {
            clearTimeout(timeout);
            reject(new Error('소켓 객체가 존재하지 않습니다'));
          }
        });
        
        return await socketPromise;
      } else {
        console.log('[useChat] 소켓 연결 상태가 좋지 않아 HTTP API로 전환:', {
          socketExists: !!socketRef.current,
          socketConnected,
          hasError: !!error
        });
        throw new Error('소켓 연결이 없거나 연결되지 않음');
      }
    } catch (socketError) {
      console.warn('[useChat] 소켓 전송 실패, HTTP API로 시도:', socketError);
      
      // HTTP API 폴백
      try {
        console.log('[useChat] HTTP API로 메시지 전송 시도');
        
        const requestBody: any = {
          content,
          senderId: actualUserId
        };
        
        // 거래 ID가 있으면 포함
        if (transactionId) {
          requestBody.purchaseId = transactionId;
        }
        
        // 수신자 ID가 있고 자신의 ID와 다른 경우에만 포함
        if (otherUserId && otherUserId !== actualUserId) {
          requestBody.receiverId = otherUserId;
        }
        
        // 인증 토큰 가져오기
        const authToken = getAuthToken();
        
        console.log('[useChat] HTTP API 요청 정보:', { 
          url: '/api/messages',
          hasToken: !!authToken, 
          tokenLength: authToken.length,
          tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : '토큰 없음',
          requestBody 
        });
        
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          console.log('[useChat] HTTP API 메시지 전송 성공:', result);
          updateMessageStatus(clientId, 'sent', result.messageId || result.id);
          
          // 메시지를 성공적으로 보낸 후 메시지 목록을 강제로 업데이트
          // 여러 번 호출되지 않도록 타이머 ID 저장 및 클리어
          const timerId = setTimeout(() => {
            fetchMessages({ force: true, forceScrollToBottom: true }).catch(err => {
              console.error('[useChat] 메시지 전송 후 메시지 목록 업데이트 실패:', err);
            });
          }, 300);
          
          return true;
        } else {
          throw new Error(result.error || result.message || '메시지 전송 실패');
        }
      } catch (httpError) {
        console.error('[useChat] HTTP API 메시지 전송 오류:', httpError);
        return handleMessageSendError(clientId, content, httpError);
      }
    }
  }, [actualUserId, otherUserId, transactionId, socketConnected, updateMessageStatus, error, handleMessageSendError, fetchMessages]);

  // 메시지 이벤트 핸들러 관리를 위한 ref
  const messageHandlerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimestampRef = useRef<number>(0);
  
  // 메시지 수신할 때 메시지 리스트를 자동으로 업데이트
  useEffect(() => {
    const messageReceivedHandler = () => {
      // 1. 이미 업데이트 중이면 중복 요청 방지
      if (isUpdatingRef.current) {
        console.log('[useChat] 이미 업데이트 중, 요청 무시');
        return;
      }
      
      // 2. 요청 빈도 제한 (1초 내 중복 이벤트 무시)
      const now = Date.now();
      if (now - lastEventTimestampRef.current < 1000) {
        console.log('[useChat] 이벤트 빈도 제한, 요청 무시');
        
        // 기존 예약된 타이머가 있으면 취소
        if (messageHandlerTimeoutRef.current) {
          clearTimeout(messageHandlerTimeoutRef.current);
        }
        
        // 새로운 타이머 설정 (1초 후 실행)
        messageHandlerTimeoutRef.current = setTimeout(() => {
          messageReceivedHandler();
        }, 1000);
        
        return;
      }
      
      // 3. 타임스탬프 업데이트
      lastEventTimestampRef.current = now;
      isUpdatingRef.current = true;
      
      // 4. API 호출 지연 시간을 1초로 증가
      console.log('[useChat] 메시지 수신 이벤트, 업데이트 예약 (1초 후)');
      messageHandlerTimeoutRef.current = setTimeout(() => {
        fetchMessages({ force: true, forceScrollToBottom: true, smoothScroll: false, silent: true })
          .catch(err => {
            console.error('[useChat] 메시지 수신 이벤트 후 메시지 목록 업데이트 실패:', err);
          })
          .finally(() => {
            isUpdatingRef.current = false;
            messageHandlerTimeoutRef.current = null;
          });
      }, 1000);
    };

    if (socketRef.current) {
      // 기존 이벤트 리스너 제거 후 새로 등록
      socketRef.current.off('message', messageReceivedHandler);
      socketRef.current.off('messageReceived', messageReceivedHandler);
      socketRef.current.off('messageUpdated', messageReceivedHandler);
      
      socketRef.current.on('message', messageReceivedHandler);
      socketRef.current.on('messageReceived', messageReceivedHandler);
      socketRef.current.on('messageUpdated', messageReceivedHandler);
      
      console.log('[useChat] 소켓 이벤트 리스너 설정 완료', {
        connected: socketRef.current.connected,
        socketId: socketRef.current.id
      });
    }

    return () => {
      // 타이머 정리
      if (messageHandlerTimeoutRef.current) {
        clearTimeout(messageHandlerTimeoutRef.current);
      }
      
      // 이벤트 리스너 정리
      if (socketRef.current) {
        socketRef.current.off('message', messageReceivedHandler);
        socketRef.current.off('messageReceived', messageReceivedHandler);
        socketRef.current.off('messageUpdated', messageReceivedHandler);
      }
    };
  }, [socketRef.current, fetchMessages]);

  // 소켓 이벤트 리스너 설정 개선 - 읽음 상태 처리
  useEffect(() => {
    if (!socketRef.current || !socketConnected || !roomId) return;
    
    console.log('[useChat] 소켓 이벤트 리스너 설정 중', {
      socketId: socketRef.current.id,
      connected: socketConnected,
      roomId
    });
    
    // 읽음 상태 업데이트 이벤트
    const messageReadHandler = (data: any) => {
      console.log('[useChat] messageRead 이벤트 수신:', data);
      
      // 내가 보낸 메시지의 읽음 상태 업데이트
      if (data.messageIds && Array.isArray(data.messageIds)) {
        setMessages(prev => 
          prev.map(msg => {
            if (msg.isMine && !msg.isRead && data.messageIds.includes(msg.id)) {
              console.log('[useChat] 메시지 읽음 상태 업데이트:', msg.id);
              return { ...msg, isRead: true };
            }
            return msg;
          })
        );
      } else if (data.userId) {
        // 이전 버전 호환성
        fetchMessages({ force: true, silent: true });
      }
    };
    
    // 읽음 상태 이벤트 등록
    socketRef.current.on('messageRead', messageReadHandler);
    
    // 이벤트 콜백 확인
    console.log('[useChat] 읽음 상태 이벤트 리스너 등록 완료');
    
    return () => {
      console.log('[useChat] 읽음 상태 이벤트 리스너 제거');
      if (socketRef.current) {
        socketRef.current.off('messageRead', messageReadHandler);
      }
    };
  }, [socketConnected, roomId, fetchMessages]);

  // 타이핑 이벤트 리스너 설정
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // 타이핑 이벤트 핸들러 함수
    const handleTypingEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};
      const isTyping = detail.isTyping || false;
      const timestamp = detail.timestamp || Date.now();
      const inputValue = detail.inputValue || '';
      
      console.log('[useChat] 타이핑 이벤트 감지:', { isTyping, timestamp, inputValueLength: inputValue.length });
      
      // 타이핑 상태 업데이트
      isUserTypingRef.current = isTyping;
      lastTypingEventTimeRef.current = timestamp;
      
      // 기존 타이머 초기화
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // 사용자가 타이핑 중이라면 타이핑이 끝난 후 쿨다운 타이머 설정
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          console.log('[useChat] 타이핑 쿨다운 완료, 타이핑 상태 해제');
          isUserTypingRef.current = false;
          typingTimeoutRef.current = null;
        }, typingCooldownRef.current);
      } else {
        // 타이핑 종료 이벤트를 받았을 때 즉시 타이핑 상태 해제하지 않고
        // 일정 시간(5초) 후에 해제하여 마지막 입력 후 여유 시간 제공
        typingTimeoutRef.current = setTimeout(() => {
          console.log('[useChat] 타이핑 종료 후 추가 쿨다운 완료');
          isUserTypingRef.current = false;
          typingTimeoutRef.current = null;
        }, 5000);
      }
    };
    
    // 이벤트 리스너 등록
    window.addEventListener('chat:typing', handleTypingEvent);
    
    // 클린업 함수 반환
    return () => {
      window.removeEventListener('chat:typing', handleTypingEvent);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      console.log('[useChat] 컴포넌트 언마운트 - 리소스 정리');
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      
      if (socketRef.current) {
        unregisterAllSocketEvents(socketRef.current);
        socketRef.current.disconnect();
      }
    };
  }, [unregisterAllSocketEvents]);

  // 훅 반환 객체
  return {
    messages,
    isLoading,
    error,
    socketConnected,
    sendMessage,
    fetchMessages,
    roomId,
    transactionInfo,
    otherUserInfo,
    conversations,
    hasMore,
    markMessagesAsRead
  };
} 