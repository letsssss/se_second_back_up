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
  const pollingIntervalRef = useRef<number>(3000); // 기본값 3초로 단축
  // 폴링 타이머 ID를 저장하는 ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 활성 폴링 여부를 저장하는 ref
  const isPollingActiveRef = useRef<boolean>(true);
  
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

  // Socket.io 서버 설정 및 연결 관리
  const setupSocket = useCallback(() => {
    if (!actualUserId) {
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
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 30000,
        forceNew: connectionAttempts.current > 0,
        autoConnect: true,
        reconnection: true,
        withCredentials: true,
        query: {
          userId: actualUserId,
          transactionId: transactionId || ''
        }
      });
      
      socketRef.current = socket;
      
      // 소켓 이벤트 리스너 설정
      socket.on('connect', () => {
        console.log('[useChat] 소켓 연결 성공:', socket.id);
        setSocketConnected(true);
        setError(null);
        connectionAttempts.current = 0;
        
        // 연결 성공 시 채팅방 참가
        if (transactionId) {
          console.log('[useChat] 채팅방 참가 요청:', {
            purchaseId: transactionId,
            userId: actualUserId,
            userRole
          });
          
          socket.emit('createOrJoinRoom', {
            purchaseId: transactionId,
            userId: actualUserId,
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
        
        // 연결 시도 횟수 증가 및 제한 확인
        connectionAttempts.current += 1;
        if (connectionAttempts.current >= 5) {
          console.error('[useChat] 최대 연결 시도 횟수 초과, 연결 중단');
          socket.disconnect();
          
          // HTTP API 폴백으로 전환
          switchToHttpPolling();
        }
      });
      
      // 연결 해제 처리
      socket.on('disconnect', (reason) => {
        console.log('[useChat] 소켓 연결 해제:', reason);
        setSocketConnected(false);
        if (reason === 'io server disconnect') {
          // 서버에서 연결을 끊은 경우 수동으로 재연결 시도
          setTimeout(() => {
            if (socketRef.current) {
              console.log('[useChat] 서버 연결 해제 후 재연결 시도');
              socketRef.current.connect();
            }
          }, 1000);
        }
      });

      // 메시지 수신 이벤트
      socket.on('message', (newMessage) => {
        console.log('[useChat] 새 메시지 수신:', newMessage);
        if (newMessage) {
          setMessages((prevMessages) => {
            // 이미 존재하는 메시지인지 확인
            const isDuplicate = prevMessages.some(
              (msg) => msg.id === newMessage.id
            );
            
            if (isDuplicate) {
              return prevMessages;
            }
            
            // 새로운 메시지 형식 변환 및 추가
            const formattedMessage: Message = {
              id: newMessage.id,
              senderId: newMessage.senderId?.toString() || newMessage.userId?.toString() || '',
              text: newMessage.content || newMessage.text || '',
              timestamp: newMessage.createdAt || newMessage.timestamp || new Date().toISOString(),
              isMine: Number(newMessage.senderId || newMessage.userId) === Number(actualUserId),
              status: 'sent'
            };
            
            return [...prevMessages, formattedMessage];
          });
        }
      });

      // 메시지 전송 결과 이벤트 (메시지 상태 업데이트)
      socket.on('messageSent', (data) => {
        console.log('메시지 전송 결과:', data);
        // 임시 메시지의 상태 업데이트
        if (data && data.messageId) {
          if (data.status === 'sent' || data.status === 'success') {
            // 성공적으로 전송된 메시지 상태 업데이트
            updateMessageStatus(
              data.clientId || data.messageId, 
              'sent', 
              data.messageId
            );
            console.log('메시지 전송 성공:', data.messageId);
          } else if (data.status === 'failed') {
            // 실패한 메시지 상태 업데이트
            updateMessageStatus(
              data.clientId || data.messageId, 
              'failed'
            );
            console.error('메시지 전송 실패:', data.error || '알 수 없는 오류');
          }
        }
      });
      
      // 채팅방 참가 결과 이벤트
      socket.on('roomJoined', (data) => {
        console.log('채팅방 참가 결과:', data);
        if (data && data.messages && Array.isArray(data.messages)) {
          const formattedMessages = data.messages.map((msg: any) => ({
            id: msg.id,
            senderId: Number(msg.senderId),
            text: msg.content,
            timestamp: msg.createdAt || msg.timestamp,
            isMine: Number(msg.senderId) === Number(actualUserId),
            status: 'sent'
          }));
          setMessages(formattedMessages);
        }
      });
      
      // 채팅 기록 이벤트
      socket.on('chatHistory', (data) => {
        console.log('채팅 기록 수신:', data);
        if (data && data.messages && Array.isArray(data.messages)) {
          const formattedMessages = data.messages.map((msg: any) => ({
            id: msg.id,
            senderId: Number(msg.senderId || msg.user?.id),
            text: msg.content,
            timestamp: msg.createdAt || msg.timestamp,
            isMine: Number(msg.senderId || msg.user?.id) === Number(actualUserId),
            status: 'sent'
          }));
          setMessages(formattedMessages);
        }
      });
      
      // 소켓 오류 이벤트
      socket.on('socketError', (error) => {
        console.error('소켓 오류:', error);
      });
      
      // 재연결 시도 이벤트
      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`재연결 시도 ${attemptNumber}번째...`);
      });
      
      // 재연결 성공 이벤트
      socket.on('reconnect', (attemptNumber) => {
        console.log(`재연결 성공! (${attemptNumber}번째 시도)`);
        setSocketConnected(true);
        
        // 재연결 후 채팅방 재참가
        console.log('재연결 후 채팅방 재참가 시도');
        socket.emit('createOrJoinRoom', {
          purchaseId: transactionId,
          userId: actualUserId,
          userRole: userRole
        });
      });
      
      // 오류 이벤트
      socket.on('error', (error) => {
        const errorInfo = error ? 
          (typeof error === 'object' ? JSON.stringify(error, null, 2) : error) : 
          '알 수 없는 오류';
        console.error('Socket.io 오류 발생:', errorInfo);
        
        // 소켓 오류가 발생해도 메시지 로드 시도
        if ((errorInfo.includes('인증') || errorInfo.includes('auth')) && !isLoading) {
          console.log('인증 오류 발생으로 HTTP API 통해 메시지 로드 시도');
          fetchMessages({ force: true }).catch(err => 
            console.error('메시지 로드 실패:', err)
          );
        }
      });

      // 재연결 실패 이벤트
      socket.on('reconnect_failed', () => {
        console.error('Socket.io 재연결 실패');
        setSocketConnected(false);
        
        // 재연결 실패 시 다시 연결 시도
        console.log('재연결 완전 실패 후 소켓 재생성 시도...');
        setTimeout(setupSocket, 2000);
      });
    } catch (socketInitError: any) {
      console.error('[useChat] 소켓 연결 생성 중 오류:', socketInitError);
      console.error('[useChat] 오류 상세:', socketInitError.message || '알 수 없는 오류');
      setError('소켓 연결 실패: ' + (socketInitError.message || '서버에 연결할 수 없습니다'));
      
      // 지연된 API 호출로 변경
      setTimeout(() => {
        console.log('[useChat] 소켓 연결 실패 후 HTTP API로 메시지 가져오기 시도');
        // fetchMessages 호출 대신 상태만 변경
        setIsLoading(true);
      }, 1000);
    }
  }, [actualUserId, transactionId, otherUserId, userRole]);

  // 소켓 연결 설정 useEffect 제거하고 actualUserId 변경 시 소켓 설정 실행하는 useEffect만 유지
  useEffect(() => {
    if (actualUserId) {
      setupSocket();
    }
    
    return () => {
      if (socketRef.current) {
        console.log('[useChat] 소켓 연결 정리');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [actualUserId, setupSocket]);

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
    
    if (isLoading && !force) {
      console.log('[useChat] 이미 로딩 중, 요청 무시');
      return false;
    }
    
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
        if (data.messages?.length > 0 && data.messages[0].roomId) {
          const firstMsgRoomId = data.messages[0].roomId;
          console.log('[useChat] 메시지에서 룸 ID 추출:', firstMsgRoomId);
          setRoomId(String(firstMsgRoomId));
        }
      }
      
      if (data.messages && Array.isArray(data.messages)) {
        // 메시지 형식 변환
        const formattedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          senderId: String(msg.senderId),
          receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
          text: msg.content,
          timestamp: msg.createdAt,
          isMine: String(msg.senderId) === actualUserId,
          status: 'sent',
          isRead: msg.isRead
        }));
        
        setMessages(formattedMessages);
        
        // 최신 메시지 ID 업데이트 (마지막 메시지가 최신임)
        if (formattedMessages.length > 0) {
          const newestMessage = formattedMessages[formattedMessages.length - 1];
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
    }
  }, [actualUserId, transactionId, otherUserId, isLoading, triggerScrollToBottom, getHumanReadableError]);

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
    
    if (!roomId || !actualUserId) {
      console.warn('[useChat] markMessagesAsRead: 방 ID 또는 사용자 ID가 없습니다.');
      
      // 이미 메시지가 있는데 roomId가 없는 경우 경고 로그만 남김
      if (messages.length > 0) {
        console.log('[useChat] 메시지는 있지만 roomId가 없음. roomId가 로드될 때까지 기다려주세요.');
      }
      
      return false;
    }

    // 읽지 않은 메시지가 있는지 확인
    const hasUnreadMessages = messages.some(msg => !msg.isMine && !msg.isRead);
    console.log('[useChat] 읽지 않은 메시지 존재 여부:', hasUnreadMessages, '전체 메시지 수:', messages.length);
    
    // 읽지 않은 메시지가 없으면 바로 종료
    if (!hasUnreadMessages) {
      console.log('[useChat] 읽지 않은 메시지가 없어서 읽음 처리 스킵');
      return true;
    }

    try {
      // 소켓 연결 상태 확인
      if (socketRef.current && socketConnected) {
        console.log('[useChat] 소켓으로 읽음 상태 업데이트 시도:', { 
          roomId, 
          userId: actualUserId 
        });
        
        socketRef.current.emit('markAsRead', {
          roomId,
          userId: parseInt(actualUserId)
        });
        
        console.log('[useChat] 소켓으로 읽음 상태 업데이트 요청 전송 완료');
        
        // 로컬 메시지 상태 업데이트
        setMessages(prev => {
          const updated = prev.map(msg => {
            if (!msg.isMine && !msg.isRead) {
              console.log('[useChat] 메시지 읽음 처리:', msg.id);
              return { ...msg, isRead: true };
            }
            return msg;
          });
          
          console.log('[useChat] 메시지 업데이트 완료:', 
            updated.filter(m => !m.isMine).map(m => ({id: m.id, isRead: m.isRead}))
          );
          
          return updated;
        });
        
        // 일정 시간 후에 메시지 목록을 다시 확인하는 코드 추가
        setTimeout(() => {
          // 소켓 이벤트를 통해 메시지 상태 업데이트 요청
          if (socketRef.current) {
            socketRef.current.emit('getMessages', { roomId });
          }
        }, 500);
        
        return true;
      } else {
        // HTTP API로 읽음 상태 업데이트
        console.log('[useChat] HTTP API로 읽음 상태 업데이트 시도');
        
        const authToken = getAuthToken();
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
        
        const responseData = await response.json();
        console.log('[useChat] 읽음 상태 API 응답:', responseData);
        
        if (response.ok) {
          // 로컬 메시지 상태 업데이트
          setMessages(prev => {
            const updated = prev.map(msg => {
              if (!msg.isMine && !msg.isRead) {
                console.log('[useChat] 메시지 읽음 처리(HTTP):', msg.id);
                return { ...msg, isRead: true };
              }
              return msg;
            });
            
            console.log('[useChat] 메시지 업데이트 완료(HTTP):', 
              updated.filter(m => !m.isMine).map(m => ({id: m.id, isRead: m.isRead}))
            );
            
            return updated;
          });
          
          // 일정 시간 후에 메시지 목록을 다시 가져오기
          // 순환 참조를 피하기 위해 직접 API 호출 사용
          setTimeout(async () => {
            try {
              // HTTP API를 통해 메시지 가져오기
              const params = new URLSearchParams();
              if (transactionId) {
                params.append('purchaseId', transactionId);
              }
              if (otherUserId) {
                params.append('conversationWith', otherUserId);
              }
              
              const authToken = getAuthToken();
              const response = await fetch(`/api/messages?${params.toString()}`, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                }
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.messages && Array.isArray(data.messages)) {
                  const formattedMessages: Message[] = data.messages.map((msg: any) => ({
                    id: msg.id,
                    senderId: String(msg.senderId),
                    receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
                    text: msg.content,
                    timestamp: msg.createdAt,
                    isMine: String(msg.senderId) === actualUserId,
                    status: 'sent',
                    isRead: msg.isRead
                  }));
                  
                  setMessages(formattedMessages);
                  console.log('[useChat] 읽음 처리 후 메시지 상태 업데이트 완료');
                }
              }
            } catch (error) {
              console.error('[useChat] 읽음 처리 후 메시지 확인 오류:', error);
            }
          }, 500);
          
          return true;
        } else {
          throw new Error(`읽음 상태 업데이트 실패: ${responseData.error || '알 수 없는 오류'}`);
        }
      }
    } catch (error) {
      console.error('[useChat] 읽음 상태 업데이트 오류:', error);
      return false;
    }
  }, [roomId, actualUserId, socketConnected, messages, transactionId, otherUserId]);

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

  // 메시지 수신할 때 메시지 리스트를 자동으로 업데이트
  useEffect(() => {
    const messageReceivedHandler = () => {
      // 이미 업데이트 중이면 중복 요청 방지
      if (isUpdatingRef.current) return;
      
      isUpdatingRef.current = true;
      // 약간의 지연을 두어 메시지가 서버에 저장될 시간을 제공
      setTimeout(() => {
        fetchMessages({ force: true, forceScrollToBottom: true, smoothScroll: false, silent: true })
          .catch(err => {
            console.error('[useChat] 메시지 수신 이벤트 후 메시지 목록 업데이트 실패:', err);
          })
          .finally(() => {
            isUpdatingRef.current = false;
          });
      }, 300);
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

  // 소켓 연결 실패 시 HTTP API로 전환하는 함수
  const switchToHttpPolling = useCallback(() => {
    if (useHttpPolling) return; // 이미 HTTP 폴링 중이면 스킵
    
    console.log('[useChat] Socket.IO 연결 실패, HTTP 폴링으로 전환합니다.');
    setUseHttpPolling(true);
    setSocketConnectionFailed(true);
    
    // 폴링 시작
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }
    
    // 즉시 메시지 가져오기
    fetchMessages({ force: true }).catch(err => {
      console.error('[useChat] 초기 메시지 로드 실패:', err);
    });
    
    // 폴링 타이머 설정
    pollingTimerRef.current = setTimeout(pollMessages, pollingIntervalRef.current);
  }, [useHttpPolling, fetchMessages]);
  
  // 주기적으로 메시지를 폴링하는 함수
  const pollMessages = useCallback(() => {
    if (!useHttpPolling || !isPollingActiveRef.current) return;
    
    console.log('[useChat] HTTP 폴링으로 메시지 가져오기...');
    fetchMessages({ force: true, silent: true })
      .catch(err => {
        console.error('[useChat] 폴링 중 메시지 로드 실패:', err);
      })
      .finally(() => {
        // 다음 폴링 설정
        if (isPollingActiveRef.current && useHttpPolling) {
          pollingTimerRef.current = setTimeout(pollMessages, pollingIntervalRef.current);
        }
      });
  }, [useHttpPolling, fetchMessages]);

  // 컴포넌트 마운트/언마운트 및 의존성 변경 시 실행
  useEffect(() => {
    if (!actualUserId || !transactionId) return;
    
    console.log('[useChat] 초기화 중, userId:', actualUserId, 'transactionId:', transactionId);
    
    // 소켓 연결 시도
    if (!socketConnectionFailed) {
      setupSocket();
    }
    
    // HTTP 폴링으로 전환된 경우
    if (useHttpPolling && !pollingTimerRef.current) {
      console.log('[useChat] HTTP 폴링 시작...');
      pollMessages();
    }
    
    // 클린업 함수
    return () => {
      console.log('[useChat] 정리 중...');
      isPollingActiveRef.current = false;
      
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      
      if (socketRef.current) {
        console.log('[useChat] 소켓 연결 해제...');
        socketRef.current.disconnect();
      }
    };
  }, [actualUserId, transactionId, setupSocket, socketConnectionFailed, useHttpPolling, pollMessages]);

  // 폴링 시작 함수
  const startPolling = useCallback(() => {
    if (!isPollingActiveRef.current) return;
    
    // 기존 타이머가 있으면 제거
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }
    
    // 새 타이머 설정
    pollingTimerRef.current = setTimeout(async () => {
      if (actualUserId && transactionId) {
        console.log('[useChat] 폴링으로 메시지 확인 중...');
        try {
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
          
          const response = await fetch(`/api/messages?${params.toString()}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            }
          });
          
          if (!response.ok) {
            console.warn('[useChat] 폴링 중 오류:', response.status);
          } else {
            const data = await response.json();
            
            // 새 메시지가 있는지 확인
            if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
              const newMessages = data.messages;
              
              console.log('[useChat] 폴링으로 가져온 메시지 수:', newMessages.length);
              console.log('[useChat] 현재 lastMessageId:', lastMessageId);
              
              // 서버에서 가져온 메시지와 현재 상태의 메시지 비교
              let hasNewMessages = false;
              
              // 가장 최근 메시지의 ID를 가져옵니다 (일반적으로 배열의 마지막 요소)
              const serverNewestMessageId = newMessages[newMessages.length - 1]?.id;
              
              // 중요: 디버깅 정보 출력
              if (serverNewestMessageId) {
                console.log('[useChat] 서버 최신 메시지 ID:', serverNewestMessageId);
                const serverNewestMessage = newMessages[newMessages.length - 1];
                console.log('[useChat] 서버 최신 메시지 내용:', 
                  serverNewestMessage?.content?.substring(0, 30) || '내용 없음');
              }
              
              // 서버에서 가져온 메시지 중 lastMessageId 이후에 추가된 메시지가 있는지 확인
              if (lastMessageId) {
                // 메시지 ID를 기준으로 새 메시지 확인
                const lastMessageIndex = newMessages.findIndex((msg: any) => msg.id === lastMessageId);
                
                // lastMessageId가 서버 메시지에 없거나 마지막 메시지가 아니면 새 메시지가 있는 것
                if (lastMessageIndex === -1 || lastMessageIndex < newMessages.length - 1) {
                  hasNewMessages = true;
                  console.log('[useChat] 새 메시지 감지! lastMessageIndex:', lastMessageIndex);
                }
              } else {
                // lastMessageId가 없으면 모든 메시지가 새 메시지
                hasNewMessages = newMessages.length > 0;
                console.log('[useChat] lastMessageId가 없어 모든 메시지를 새 메시지로 간주합니다.');
              }
              
              // 또는 메시지 수로 비교 (messages.length < newMessages.length)
              if (messages.length < newMessages.length) {
                hasNewMessages = true;
                console.log('[useChat] 메시지 수 증가 감지:', 
                  `현재: ${messages.length}, 서버: ${newMessages.length}`);
              }
              
              // 새 메시지가 있으면 메시지 목록 업데이트
              if (hasNewMessages) {
                console.log('[useChat] 새 메시지 감지됨, 메시지 목록 업데이트');
                
                // 새 메시지가 있으면 메시지 목록 업데이트
                const formattedMessages: Message[] = newMessages.map((msg: any) => ({
                  id: msg.id,
                  senderId: String(msg.senderId),
                  receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
                  text: msg.content,
                  timestamp: msg.createdAt,
                  isMine: String(msg.senderId) === actualUserId,
                  status: 'sent'
                }));
                
                setMessages(formattedMessages);
                
                // 마지막 메시지 ID 업데이트
                if (formattedMessages.length > 0) {
                  const newestMsg = formattedMessages[formattedMessages.length - 1];
                  setLastMessageId(newestMsg.id);
                  console.log('[useChat] lastMessageId를 업데이트했습니다:', newestMsg.id);
                }
                
                // 스크롤 이벤트 트리거
                if (typeof window !== 'undefined') {
                  triggerScrollToBottom(false); // 부드러운 스크롤 없이 즉시 이동
                }
              } else {
                console.log('[useChat] 새 메시지 없음');
              }
            }
          }
        } catch (error) {
          console.error('[useChat] 폴링 중 오류:', error);
        }
      }
      
      // 폴링 재시작
      startPolling();
    }, pollingIntervalRef.current);
  }, [actualUserId, transactionId, otherUserId, lastMessageId, messages.length]);

  // 페이지/컴포넌트가 마운트되었을 때 폴링 시작 - 폴링 메커니즘 개선
  useEffect(() => {
    if (actualUserId && transactionId) {
      console.log('[useChat] 폴링 시작');
      isPollingActiveRef.current = true;
      
      // 매 5초마다 강제로 폴링 실행 (소켓 연결 상태와 무관하게) - silent 모드로 로딩 표시 없이 실행
      const forcedPollingTimer = setInterval(() => {
        console.log('[useChat] 강제 폴링 실행...');
        fetchMessages({ force: true, silent: true })
          .catch(err => console.error('[useChat] 강제 폴링 실패:', err));
      }, pollingIntervalRef.current);
      
      // 초기 로딩
      startPolling();
      
      return () => {
        // 컴포넌트 언마운트 시 폴링 중지
        console.log('[useChat] 폴링 중지 및 타이머 정리');
        isPollingActiveRef.current = false;
        
        clearInterval(forcedPollingTimer);
        
        if (pollingTimerRef.current) {
          clearTimeout(pollingTimerRef.current);
        }
      };
    }
  }, [actualUserId, transactionId, startPolling, fetchMessages]);

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

  // roomId가 설정되는지 추적하는 useEffect 추가
  useEffect(() => {
    console.log('[useChat] roomId 변경됨:', roomId);
  }, [roomId]);

  // 주기적인 메시지 폴링 함수 추가
  const fetchMessagesFromAPI = useCallback(async (roomId: string, userId: string) => {
    try {
      // HTTP API를 통해 메시지 가져오기
      const params = new URLSearchParams();
      if (transactionId) {
        params.append('purchaseId', transactionId);
      }
      if (otherUserId) {
        params.append('conversationWith', otherUserId);
      }
      
      // 캐시 방지용 타임스탬프
      params.append('_t', Date.now().toString());
      
      const authToken = getAuthToken();
      const response = await fetch(`/api/messages?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });
      
      if (!response.ok) {
        throw new Error(`메시지 가져오기 실패: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[useChat] API에서 메시지 가져오기 실패:', error);
      return null;
    }
  }, [transactionId, otherUserId]);

  // 메시지 형식 변환 함수
  const transformMessages = useCallback((messagesData: any[], userId: string): Message[] => {
    return messagesData.map((msg: any) => ({
      id: msg.id,
      senderId: String(msg.senderId),
      receiverId: msg.receiverId ? String(msg.receiverId) : undefined,
      text: msg.content,
      timestamp: msg.createdAt,
      isMine: String(msg.senderId) === userId,
      status: 'sent',
      isRead: msg.isRead
    }));
  }, []);

  // 메시지 변경 감지용 해시 계산 함수
  const calculateMessagesHash = useCallback((messages: Message[]): string => {
    return messages.map(m => `${m.id}:${m.isRead}`).join('|');
  }, []);

  // 이전 메시지 해시값 저장용 ref (useEffect 외부로 이동)
  const prevMessagesHashRef = useRef<string>('');

  // 주기적인 메시지 체크 로직 구현
  useEffect(() => {
    // 최초 렌더링 시 해시값 초기화
    prevMessagesHashRef.current = calculateMessagesHash(messages);
    
    let pollingInterval: NodeJS.Timeout | null = null;
    
    // roomId가 있을 때만 폴링 설정
    if (roomId && actualUserId) {
      console.log('[useChat] 메시지 감지 타이머 설정');
      
      pollingInterval = setInterval(async () => {
        // 소켓이 연결된 상태에서는 폴링 안함
        if (socketConnected && socketRef.current?.connected) {
          return;
        }
        
        // 업데이트 중이면 중복 요청 방지
        if (isUpdatingRef.current) return;
        
        isUpdatingRef.current = true;
        
        try {
          const response = await fetchMessagesFromAPI(roomId, actualUserId);
          if (!response || !response.success) return;
          
          const fetchedMessages = transformMessages(response.messages, actualUserId);
          const newMessagesHash = calculateMessagesHash(fetchedMessages);
          
          // 변경이 있을 때만 상태 업데이트
          if (newMessagesHash !== prevMessagesHashRef.current) {
            console.log('[useChat] 메시지 변경 감지, 상태 업데이트 중');
            setMessages(fetchedMessages);
            prevMessagesHashRef.current = newMessagesHash;
            
            // 새 메시지가 있는지 확인
            const hasNewMessages = fetchedMessages.length > messages.length;
            if (hasNewMessages) {
              // 스크롤 이벤트 트리거
              triggerScrollToBottom(true);
            }
          }
        } catch (error) {
          console.error('[useChat] 메시지 감지 오류:', error);
        } finally {
          isUpdatingRef.current = false;
        }
      }, 5000); // 5초마다 폴링 (소켓 연결이 없을 때)
    }
    
    return () => {
      if (pollingInterval) {
        console.log('[useChat] 메시지 감지 타이머 정리');
        clearInterval(pollingInterval);
      }
    };
  }, [roomId, actualUserId, socketConnected, messages, calculateMessagesHash, transformMessages, fetchMessagesFromAPI, triggerScrollToBottom]);

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