import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket, io } from 'socket.io-client';

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
  fetchMessages: (force?: boolean) => Promise<boolean>;
  roomId: string | null;
  transactionInfo: any | null;
  otherUserInfo: any | null;
  conversations: any[];
  hasMore: boolean;
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
  const [roomId, setRoomId] = useState<string | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<any | null>(null);
  const [otherUserInfo, setOtherUserInfo] = useState<any | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  
  // 인증 토큰 가져오기 함수 - useChat 내부로 이동
  const getAuthToken = useCallback(() => {
    let token = '';
    let tokenSource = '';
    
    // 브라우저 환경이 아닌 경우 빈 문자열 반환
    if (typeof window === 'undefined') {
      console.log('[useChat] 브라우저 환경이 아니므로 토큰을 가져올 수 없습니다.');
      return '';
    }
    
    const sources = [
      { storage: localStorage, key: 'auth-token' },
      { storage: localStorage, key: 'token' },
      { storage: sessionStorage, key: 'auth-token' },
      { storage: sessionStorage, key: 'token' }
    ];
    
    for (const { storage, key } of sources) {
      try {
        const value = storage.getItem(key);
        if (value && value.length > 10) { // 의미 있는 토큰인지 확인
          token = value;
          tokenSource = storage === localStorage ? `localStorage.${key}` : `sessionStorage.${key}`;
          break;
        }
      } catch (e) {
        // 스토리지 접근 오류 무시
      }
    }
    
    console.log('[useChat] 인증 토큰 검색 결과:', {
      found: !!token,
      source: tokenSource || '없음',
      preview: token ? `${token.substring(0, 10)}...` : '토큰 없음',
      length: token.length
    });
    
    return token;
  }, []);
  
  // 메시지 로딩 중 상태를 추적하는 ref
  const isLoadingMessagesRef = useRef<boolean>(false);

  // 소켓 연결 상태 관리
  const socketRef = useRef<Socket | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);

  // 옵션 활용
  const actualUserId = options?.userId || getUserFromLocalStorage()?.id?.toString();
  const transactionId = options?.transactionId;
  const otherUserId = options?.otherUserId;
  const userRole = options?.userRole || 'user';

  // 사용자 ID를 localStorage에서 가져오기
  const [actualUserIdState, setActualUserIdState] = useState<string | null>(null);
  
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
      if (actualUserId) {
        id = actualUserId;
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
    
    setActualUserIdState(id);
    console.log('[useChat] 사용자 ID 설정:', id);
  }, [actualUserId, options]);

  // 메시지 목록 가져오기
  const fetchMessages = useCallback(async (
    options?: { 
      force?: boolean; 
      forceScrollToBottom?: boolean; // 메시지 로드 후 강제로 스크롤을 아래로 이동시킬지 여부
    }
  ): Promise<boolean> => {
    const force = options?.force || false;
    const forceScrollToBottom = options?.forceScrollToBottom ?? true; // 기본값은 true

    if (!actualUserIdState || !transactionId) {
      console.error('[useChat] 사용자 ID가 설정되지 않아 메시지를 가져올 수 없습니다.');
      setError('사용자 ID가 설정되지 않았습니다.');
      return false;
    }
    
    if (isLoadingMessagesRef.current && !force) {
      console.log('[useChat] 메시지를 이미 불러오는 중, 요청 무시');
      return false;
    }
    
    isLoadingMessagesRef.current = true;
    setIsLoading(true);
    
    try {
      console.log('[useChat] 메시지 가져오기 시작:', {
        transactionId,
        userId: actualUserIdState,
        otherUserId
      });
      
      // 인증 토큰 가져오기
      const authToken = getAuthToken();
      
      if (!authToken) {
        console.error('[useChat] 인증 토큰이 없어 메시지를 가져올 수 없습니다.');
        throw new Error('인증 토큰이 없습니다. 로그인 상태를 확인해주세요.');
      }
      
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
      
      console.log('[useChat] 메시지 API 요청 URL:', `/api/messages?${params.toString()}`);
      console.log('[useChat] API 요청 인증 정보:', {
        hasToken: !!authToken,
        tokenLength: authToken.length,
        tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : '토큰 없음'
      });
      
      const response = await fetch(`/api/messages?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log('[useChat] 메시지 API 응답 상태:', response.status, response.statusText);
      
      if (!response.ok) {
        // 응답 본문 내용 확인
        const errorText = await response.text();
        console.error('[useChat] 메시지 API 오류 응답:', errorText);
        
        let errorMessage = '메시지를 가져오는데 실패했습니다';
        try {
          // JSON으로 파싱 시도
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // 파싱 오류는 무시하고 기본 오류 메시지 사용
        }
        
        throw new Error(`${errorMessage} (상태 코드: ${response.status})`);
      }
      
      const data = await response.json();
      console.log('[useChat] 메시지 가져오기 결과:', data);
      
      if (data.messages && Array.isArray(data.messages)) {
        // 메시지 형식 변환
        const formattedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          senderId: String(msg.senderId),
          receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
          text: msg.content,
          timestamp: msg.createdAt,
          isMine: String(msg.senderId) === actualUserIdState,
          status: 'sent'
        }));
        
        // 시간순으로 정렬 (오래된 메시지가 먼저 오도록)
        const sortedMessages = formattedMessages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // 새 메시지인지 확인하여 기존 메시지 업데이트 (애니메이션 없이)
        if (force || formattedMessages.length > 0) {
          setMessages(prevMessages => {
            // 이미 존재하는 메시지 ID 세트 생성
            const existingIds = new Set(prevMessages.map(msg => msg.id));
            
            // 새로 받은 메시지와 기존 메시지 ID 비교
            const hasNewMessages = sortedMessages.some(msg => !existingIds.has(msg.id));
            
            // 실제 메시지 수가 다르거나 새 메시지가 있는 경우에만 업데이트
            if (force || prevMessages.length !== sortedMessages.length || hasNewMessages) {
              console.log('[useChat] 새 메시지 감지, 목록 업데이트:', {
                기존메시지수: prevMessages.length,
                새메시지수: sortedMessages.length
              });
              return sortedMessages;
            }
            
            // 변경 사항이 없으면 이전 메시지 상태 유지 (리렌더링 방지)
            return prevMessages;
          });
          
          console.log('[useChat] 메시지 목록 업데이트 완료:', { 
            totalMessages: sortedMessages.length,
            oldestMessage: sortedMessages[0]?.timestamp,
            newestMessage: sortedMessages[sortedMessages.length - 1]?.timestamp
          });
        } else {
          console.log('[useChat] 메시지가 없거나 변경되지 않았습니다');
        }
      } else {
        console.warn('[useChat] 메시지 데이터가 없거나 형식이 올바르지 않습니다:', data);
        // 메시지 배열이 없으면 빈 배열로 설정 (첫 로딩 시에만)
        if (force) {
          setMessages([]);
        }
      }
      
      // 추가 정보 설정
      if (data.room) {
        setRoomId(data.room.id);
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
      
      if (forceScrollToBottom) {
        // 메시지 로드 후 스크롤을 맨 아래로 이동시키는 커스텀 이벤트 발생
        const event = new CustomEvent('chat:scrollToBottom', { detail: { smooth: false } });
        window.dispatchEvent(event);
      }
      
      return true;
    } catch (error) {
      console.error('[useChat] 메시지 가져오기 오류:', error);
      setError('메시지를 불러오는데 실패했습니다.');
      return false;
    } finally {
      isLoadingMessagesRef.current = false;
      setIsLoading(false);
    }
  }, [actualUserIdState, transactionId, otherUserId, getAuthToken]);

  // Socket.io 서버 설정 및 연결 관리
  const setupSocket = useCallback(() => {
    if (!actualUserIdState) {
      console.log('[useChat] 사용자 ID가 없음, 연결 중단');
      return;
    }

    // 이미 소켓이 존재하고 연결된 경우 스킵
    if (socketRef.current && socketRef.current.connected) {
      console.log('[useChat] 이미 연결된 소켓 존재');
      return;
    }

    console.log('[useChat] 소켓 연결 설정 시작');
    
    try {
      // 적절한 소켓 서버 URL 결정
      const socketURL = 
        process.env.NEXT_PUBLIC_SOCKET_URL || 
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      
      console.log(`[useChat] 소켓 서버 URL: ${socketURL}`);
      
      // Socket.io 인스턴스 생성 및 옵션 설정
      const socket = io(socketURL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000, // 타임아웃 증가
        forceNew: true,
        autoConnect: true, // 자동 연결 활성화
        reconnection: true, // 재연결 활성화
        withCredentials: true, // 인증 쿠키 전송 활성화
        query: {
          userId: actualUserIdState,
          transactionId: transactionId || ''
        }
      });
      
      socketRef.current = socket;
      
      // 소켓 이벤트 리스너 설정
      socket.on('connect', () => {
        console.log('[useChat] 소켓 연결 성공:', socket.id);
        setSocketConnected(true);
        setError(null);
        
        // 연결 성공 시 채팅방 참가
        if (transactionId) {
          console.log('[useChat] 채팅방 참가 요청:', {
            purchaseId: transactionId,
            userId: actualUserIdState,
            userRole
          });
          
          socket.emit('createOrJoinRoom', {
            purchaseId: transactionId,
            userId: actualUserIdState,
            userRole
          });
        }
      });
      
      // 연결 오류 처리
      socket.on('connect_error', (err) => {
        console.error('[useChat] 소켓 연결 오류:', err.message);
        console.error('[useChat] 소켓 연결 오류 상세:', err);
        setError(`연결 오류: ${err.message}`);
        setSocketConnected(false);
      });
      
      // 연결 해제 처리
      socket.on('disconnect', (reason) => {
        console.log('[useChat] 소켓 연결 해제:', reason);
        setSocketConnected(false);
        setError('연결이 끊어졌습니다. 재연결 중...');
      });
      
      // 소켓 재연결 처리
      socket.on('reconnect', (attemptNumber) => {
        console.log(`[useChat] 소켓 재연결 성공 (${attemptNumber}회 시도 후)`);
        setSocketConnected(true);
        setError(null);
      });
      
      // 기본 메시지 수신 이벤트 리스너
      socket.on('message', () => {
        console.log('[useChat] 기본 메시지 이벤트 수신');
        // 메시지 수신 시 자동으로 메시지 목록 갱신
        setTimeout(() => {
          fetchMessages({ force: true }).catch((err: Error) => {
            console.error('[useChat] 메시지 수신 후 메시지 목록 업데이트 실패:', err.message);
          });
        }, 300);
      });
      
      // 메시지 수신 이벤트 리스너
      socket.on('messageReceived', () => {
        console.log('[useChat] 새 메시지 수신 알림');
        // 새 메시지 수신 시 자동으로 메시지 목록 갱신
        setTimeout(() => {
          fetchMessages({ force: true }).catch((err: Error) => {
            console.error('[useChat] 새 메시지 수신 후 메시지 목록 업데이트 실패:', err.message);
          });
        }, 300);
      });
      
      // 메시지 업데이트 이벤트 리스너 (읽음 상태 등)
      socket.on('messageUpdated', () => {
        console.log('[useChat] 메시지 업데이트 알림 수신');
        // 메시지 상태 변경 시 자동으로 메시지 목록 갱신
        setTimeout(() => {
          fetchMessages({ force: true }).catch((err: Error) => {
            console.error('[useChat] 메시지 업데이트 후 메시지 목록 업데이트 실패:', err.message);
          });
        }, 300);
      });
      
      // 에러 이벤트 처리
      socket.on('error', (error: any) => {
        console.error('[useChat] 소켓 오류:', error);
        setError(`소켓 오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
      });
      
    } catch (error: any) {
      console.error('[useChat] 소켓 설정 중 오류 발생:', error);
      setSocketError(`소켓 설정 오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
      setSocketConnected(false);
    }
  }, [actualUserIdState, transactionId, userRole]);

  // 소켓 설정 초기화
  useEffect(() => {
    if (actualUserIdState) {
      setupSocket();
    }
    
    return () => {
      if (socketRef.current) {
        console.log('[useChat] 소켓 연결 정리');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [actualUserIdState, setupSocket]);

  // 메시지 목록 초기화 시도
  useEffect(() => {
    if (actualUserIdState) {
      console.log('[useChat] 채팅이 준비되었고 UID가 설정됨, 메시지 로드 시도');
      // 최초 로딩 시 강제로 로드
      fetchMessages({ force: true });
    }
  }, [actualUserIdState, fetchMessages]);

  // 주기적 업데이트 설정
  useEffect(() => {
    if (!actualUserIdState || !transactionId) return;

    console.log('[useChat] 주기적 폴링 시작');
    
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        console.log('[useChat] 주기적 메시지 업데이트 실행');
        fetchMessages({ force: true });
      }
    }, 10000); // 10초 간격
    
    return () => {
      console.log('[useChat] 주기적 폴링 종료');
      clearInterval(intervalId);
    };
  }, [actualUserIdState, transactionId, fetchMessages]);

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
    
    if (!actualUserIdState) {
      console.error('사용자 ID가 설정되지 않았습니다.');
      setError('사용자 ID가 설정되지 않았습니다.');
      return false;
    }

    // 새 메시지 객체 생성
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    // 새 메시지를 즉시 UI에 표시 (낙관적 업데이트)
    const newMessage: Message = {
      id: clientId,
      clientId,
      senderId: actualUserIdState,
      receiverId: otherUserId,
      text: content,
      timestamp,
      isMine: true,
      status: 'sending'
    };
    
    // 중복 메시지 방지
    if (isMessageDuplicate(clientId)) {
      console.warn('[useChat] 중복 메시지 감지됨. 전송 취소');
      return false;
    }
    
    // 새 메시지를 메시지 목록에 추가
    setMessages(prevMessages => [...prevMessages, newMessage]);
    
    let sendSuccess = false;

    // 소켓 또는 HTTP API를 사용하여 메시지 전송
    try {
      // 소켓 연결이 활성화되어 있으면 우선 소켓으로 전송 시도
      if (socketRef.current && socketConnected && !error) {
        const socket = socketRef.current;
        
        // 소켓 전송 타임아웃 설정 (5초)
        const socketPromise = new Promise<boolean>((resolve, reject) => {
          const socket = socketRef.current;
          
          if (!socket) {
            reject(new Error('소켓 객체가 존재하지 않습니다'));
            return;
          }
          
          // 응답 대기 이벤트 리스너 (먼저 정의)
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
          
          // 타임아웃 설정 (나중에 정의)
          const timeout = setTimeout(() => {
            socket.off('messageSent', messageHandler);
            reject(new Error('소켓 메시지 전송 시간 초과'));
          }, 5000);
          
          // 소켓으로 메시지 전송
          socket.emit('sendMessage', {
            roomId: `purchase_${transactionId}`,
            userId: actualUserIdState,
            recipientId: otherUserId,
            content,
            clientId,
            timestamp,
            purchaseId: transactionId
          });
          
          console.log('[useChat] 소켓으로 메시지 전송 시도 - 상세 정보:', {
            roomId: `purchase_${transactionId}`,
            userId: actualUserIdState,
            clientId: clientId
          });
          
          socket.on('messageSent', messageHandler);
        });
        
        sendSuccess = await socketPromise;
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
          senderId: actualUserIdState
        };
        
        // 거래 ID가 있으면 포함
        if (transactionId) {
          requestBody.purchaseId = transactionId;
        }
        
        // 수신자 ID가 있고 자신의 ID와 다른 경우에만 포함
        if (otherUserId && otherUserId !== actualUserIdState) {
          requestBody.receiverId = otherUserId;
        }
        
        // 인증 토큰 가져오기
        const authToken = getAuthToken();
        
        if (!authToken) {
          console.error('[useChat] 인증 토큰이 없어 메시지를 전송할 수 없습니다.');
          throw new Error('인증 토큰이 없습니다. 로그인 상태를 확인해주세요.');
        }
        
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
          sendSuccess = true;
        } else {
          throw new Error(result.error || result.message || '메시지 전송 실패');
        }
      } catch (httpError) {
        console.error('[useChat] HTTP API 메시지 전송 오류:', httpError);
        sendSuccess = await handleMessageSendError(clientId, content, httpError);
      }
    }

    // 메시지 전송 성공 후, 최신 메시지 목록 가져오기
    if (sendSuccess) {
      // 메시지 전송이 성공했을 때 1초 후에 메시지 목록 다시 가져오기
      setTimeout(() => {
        fetchMessages({ force: true, forceScrollToBottom: true });
      }, 1000);
    }

    return sendSuccess;
  }, [actualUserIdState, otherUserId, transactionId, socketConnected, updateMessageStatus, handleMessageSendError, error, fetchMessages, isMessageDuplicate, getAuthToken]);

  // 훅 반환 객체
  return {
    messages,
    sendMessage,
    isLoading,
    error,
    socketConnected,
    fetchMessages,
    roomId,
    transactionInfo,
    otherUserInfo,
    conversations,
    hasMore
  };
} 