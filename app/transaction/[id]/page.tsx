"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Calendar, MapPin, Clock, CreditCard, Play, ThumbsUp, CheckCircle, Star, Sparkles, Award } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from "framer-motion"

// Confetti를 동적으로 불러오기 (서버 사이드 렌더링 오류 방지)
const ReactConfetti = dynamic(() => import('react-confetti'), { 
  ssr: false,
  loading: () => null
})

// 캔버스 confetti 효과를 함수로 불러오기
import canvasConfetti from 'canvas-confetti'

import { Button } from "@/components/ui/button"
import { TransactionStepper } from "@/components/transaction-stepper"
import { TicketingStatusCard } from "@/components/ticketing-status-card"
import { ChatInterface } from "@/components/ChatInterface"
import { useChat } from "@/hooks/useChat"

// 거래 및 단계 관련 타입 정의
interface StepDates {
  payment: string;
  ticketing_started: string;
  ticketing_completed: string | null;
  confirmed: string | null;
}

interface Ticket {
  title: string;
  date: string;
  time: string;
  venue: string;
  seat: string;
  image: string;
}

interface User {
  id: string;
  name: string;
  profileImage: string;
}

interface TransactionData {
  id: string;
  type: string;
  status: string;
  currentStep: string;
  stepDates: StepDates;
  ticket: Ticket;
  price: number;
  paymentMethod: string;
  paymentStatus: string;
  ticketingStatus: string;
  ticketingInfo: string;
  seller?: User; // 판매자 정보 (구매자 화면인 경우)
  buyer?: User;  // 구매자 정보 (판매자 화면인 경우)
}

export default function TransactionDetail() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<'buyer' | 'seller'>('buyer')
  
  // 데이터 가져오기 오류 관련 상태 추가
  const [fetchError, setFetchError] = useState<{status: number; message: string} | null>(null)
  
  // confetti 관련 상태 추가
  const [showConfetti, setShowConfetti] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const [confettiRunning, setConfettiRunning] = useState(false)
  
  // 성공 모달 상태 추가
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  
  // 브라우저 환경 확인 상태
  const [isBrowser, setIsBrowser] = useState(false)
  
  // 현재 로그인한 사용자 ID
  const [currentUserId, setCurrentUserId] = useState<string>("")
  
  // useChat 훅 사용
  const [chatProps, setChatProps] = useState<any>(null)
  const [chatReady, setChatReady] = useState(false)

  const {
    messages,
    isLoading: isMessagesLoading,
    socketConnected,
    sendMessage,
    fetchMessages,
    error: chatError,
    markMessagesAsRead
  } = useChat(chatReady ? chatProps : null)

  // 메시지 전송 핸들러 함수 (ChatInterface에서 사용)
  const handleSendMessage = async (content: string): Promise<boolean> => {
    if (!content || !content.trim()) return false;
    
    try {
      // 직접 sendMessage 함수 호출
      const result = await sendMessage(content);
      
      if (!result) {
        toast({
          title: '메시지 전송 실패',
          description: '메시지를 전송하지 못했습니다. 다시 시도해주세요.',
          variant: 'destructive',
        });
        return false;
      }
      
      await fetchMessages({ force: true }); // 새 메시지 전송 후 다시 불러오기
      return true;
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      toast({
        title: '메시지 전송 오류',
        description: '메시지 전송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // 메시지 읽음 처리 핸들러 함수
  const handleMarkAsRead = async (): Promise<boolean> => {
    console.log('[트랜잭션 페이지] markMessagesAsRead 호출 시도', {
      chatReady,
      chatProps,
      hasChatProps: !!chatProps,
      socketConnected,
      transaction: transaction ? {
        id: transaction.id,
        status: transaction.status
      } : null,
      userId: currentUserId
    });
    
    // 채팅 관련 props나 markMessagesAsRead 함수가 없는 경우
    if (!chatProps?.markMessagesAsRead) {
      console.warn('[트랜잭션 페이지] 메시지 읽음 처리 함수가 제공되지 않음');
      return false;
    }
    
    try {
      // 함수 호출 시점의 사용자 ID 로깅
      const userIdFromStorage = typeof window !== 'undefined' ? 
        (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').id : null) : null;
      
      console.log('[트랜잭션 페이지] 메시지 읽음 처리 시작, 현재 사용자 ID:', {
        fromState: currentUserId,
        fromStorage: userIdFromStorage
      });
      
      const result = await markMessagesAsRead();
      console.log('[트랜잭션 페이지] markMessagesAsRead 호출 결과:', result);
      return result;
    } catch (error) {
      console.error('[트랜잭션 페이지] 메시지 읽음 처리 오류:', error);
      return false;
    }
  };

  // 브라우저 환경 설정 및 창 크기 측정
  useEffect(() => {
    setIsBrowser(true)
    
    // 창 크기 측정
    const updateWindowSize = () => {
      setWindowSize({ 
        width: window.innerWidth, 
        height: window.innerHeight 
      })
    }
    
    // 초기 설정
    updateWindowSize()
    
    // 리사이즈 이벤트 리스너 추가
    window.addEventListener('resize', updateWindowSize)
    
    return () => {
      window.removeEventListener('resize', updateWindowSize)
    }
  }, [])

  // 페이지 로드 시 거래 정보 가져오기 및 상태 자동 변경
  useEffect(() => {
    const fetchTransactionData = async () => {
      try {
        setIsLoading(true);
        
        // 거래 ID 가져오기 (useParams 사용)
        const id = params?.id as string; 
        
        // ID가 없는 경우 오류 처리
        if (!id) {
          toast({
            title: '거래 ID가 없음',
            description: '유효한 거래 ID를 찾을 수 없습니다.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
        
        console.log('거래 정보 가져오기 요청 ID:', id);
        
        // 거래 정보 가져오기 (오류 처리 개선)
        console.log(`API 요청 시작: /api/purchase/${id}`);
        try {
          // 로컬 스토리지에서 토큰 가져오기
          const authToken = localStorage.getItem('token') || '';
          
          const response = await fetch(`/api/purchase/${id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          console.log('API 응답 상태:', response.status, response.statusText);
          
          // 응답 내용 미리 확인 (텍스트로)
          const responseText = await response.text();
          
          if (responseText.trim().length === 0) {
            throw new Error('API에서 빈 응답을 반환했습니다.');
          }
          
          // 응답 미리보기 로그
          console.log('응답 본문 미리보기:', responseText.substring(0, 150) + '...');
          
          // 응답이 성공적이지 않은 경우
          if (!response.ok) {
            let errorMessage = '거래 정보를 가져오는데 실패했습니다';
            let errorStatus = response.status;
            
            // HTML 응답인지 확인
            if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
              console.error('API가 HTML을 반환했습니다. 서버 오류가 발생했을 수 있습니다.');
              errorMessage = 'API 서버 오류: HTML 응답을 받았습니다.';
            } else {
              try {
                // JSON으로 파싱 시도
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.message || errorMessage;
              } catch (e) {
                console.error('응답을 JSON으로 파싱할 수 없음:', e);
              }
            }
            
            console.error('API 응답 오류:', response.status, errorMessage);
            // 오류 상태 저장
            setFetchError({status: errorStatus, message: errorMessage});
            setIsLoading(false);
            return;
          }
          
          // 응답 데이터 파싱
          let purchaseData;
          try {
            purchaseData = JSON.parse(responseText);
          } catch (e) {
            console.error('JSON 파싱 오류:', e);
            throw new Error('API 응답이 유효한 JSON 형식이 아닙니다.');
          }
          
          console.log('API에서 가져온 구매 데이터:', purchaseData);
          
          // 응답이 성공적이지 않은 경우
          if (!purchaseData.success) {
            throw new Error(purchaseData.message || '거래 정보를 가져오는데 실패했습니다');
          }
          
          if (!purchaseData.purchase) {
            throw new Error('구매 데이터가 없습니다');
          }
          
          // localStorage에서 사용자 ID 가져오기
          // 세션스토리지 또는 로컬스토리지에서 사용자 정보 가져오기
          let userId = ""; // 기본값은 빈 문자열
          
          // 클라이언트 사이드에서만 실행
          if (typeof window !== 'undefined') {
            try {
              // 우선 user 객체에서 시도
              const userStr = localStorage.getItem('user');
              if (userStr) {
                const user = JSON.parse(userStr);
                if (user && user.id) {
                  userId = user.id.toString();
                  console.log('로컬스토리지에서 user 객체로부터 ID 찾음:', userId);
                }
              }
              
              // user 객체에서 ID를 찾지 못한 경우 userId 직접 시도
              if (!userId) {
                const directUserId = localStorage.getItem('userId');
                if (directUserId) {
                  userId = directUserId;
                  console.log('로컬스토리지에서 userId로부터 ID 찾음:', userId);
                }
              }
              
              // 테스트용 ID 할당 (개발 환경에서만)
              if (!userId) {
                userId = "2"; // 임시로 2 설정
                console.log('테스트를 위한 임시 ID 사용:', userId);
              }
            } catch (error) {
              console.error('로컬스토리지에서 사용자 ID 가져오기 실패:', error);
              userId = "2"; // 오류 시 기본값
            }
          }
          
          console.log('최종 사용되는 현재 사용자 ID:', userId);
          setCurrentUserId(userId);
          
          // 구매자인지 판매자인지 결정
          const userRole = userId === purchaseData.purchase?.sellerId?.toString() 
            ? 'seller' 
            : 'buyer';
          setCurrentUserRole(userRole);
          console.log('사용자 역할:', userRole);
          
          // 구매 데이터를 TransactionData 형식으로 변환
          const formattedTransaction: TransactionData = {
            id: purchaseData.purchase?.id?.toString() || "",
            type: "purchase",
            status: getStatusText(purchaseData.purchase?.status || ""),
            currentStep: purchaseData.purchase?.status || "",
            stepDates: {
              payment: purchaseData.purchase?.createdAt || "",
              ticketing_started: purchaseData.purchase?.status === 'PROCESSING' || purchaseData.purchase?.status === 'COMPLETED' || purchaseData.purchase?.status === 'CONFIRMED' 
                ? purchaseData.purchase?.updatedAt || ""
                : null,
              ticketing_completed: purchaseData.purchase?.status === 'COMPLETED' || purchaseData.purchase?.status === 'CONFIRMED' 
                ? purchaseData.purchase?.updatedAt || ""
                : null,
              confirmed: purchaseData.purchase?.status === 'CONFIRMED' 
                ? purchaseData.purchase?.updatedAt || ""
                : null,
            },
            ticket: {
              title: purchaseData.purchase?.ticketTitle || purchaseData.purchase?.post?.title || '티켓 정보 없음',
              date: purchaseData.purchase?.eventDate || purchaseData.purchase?.post?.eventDate || '날짜 정보 없음',
              time: "19:00", // 시간 정보가 없는 경우 기본값
              venue: purchaseData.purchase?.eventVenue || purchaseData.purchase?.post?.eventVenue || "공연장",
              seat: purchaseData.purchase?.selectedSeats || "좌석 정보 없음",
              image: purchaseData.purchase?.imageUrl || "/placeholder.svg", // 이미지 정보가 없을 경우 기본값
            },
            price: Number(purchaseData.purchase?.ticketPrice || purchaseData.purchase?.post?.ticketPrice) || 0,
            paymentMethod: purchaseData.purchase?.paymentMethod || "신용카드", // 결제 방식 정보 없을 경우 기본값
            paymentStatus: "결제 완료",
            ticketingStatus: getTicketingStatusText(purchaseData.purchase?.status || ""),
            ticketingInfo: "취소표 발생 시 알림을 보내드립니다. 취소표 발생 시 빠르게 예매를 진행해 드립니다. 취켓팅 완료 이후 아래의 취켓팅 완료하기 버튼을 눌러주세요.",
            seller: {
              id: purchaseData.purchase?.seller?.id?.toString() || "",
              name: purchaseData.purchase?.seller?.name || "판매자",
              profileImage: purchaseData.purchase?.seller?.profileImage || "/placeholder.svg?height=50&width=50",
            },
            buyer: {
              id: purchaseData.purchase?.buyer?.id?.toString() || "",
              name: purchaseData.purchase?.buyer?.name || "구매자",
              profileImage: purchaseData.purchase?.buyer?.profileImage || "/placeholder.svg?height=50&width=50",
            },
          };
          
          console.log('변환된 트랜잭션 데이터:', formattedTransaction);
          setTransaction(formattedTransaction);
          
          // ✅ 구매자와 판매자 ID가 모두 존재할 때만 채팅 준비
          if (purchaseData.purchase.buyer?.id && purchaseData.purchase.seller?.id) {
            // 거래 ID 또는 주문번호 준비
            const transactionIdentifier = typeof id === 'string' && id.match(/[A-Z0-9]{12}/) 
              ? id  // 주문번호 형식이면 그대로 사용 (예: XJ2HR85VVGH4)
              : purchaseData.purchase.id.toString(); // 그렇지 않으면 숫자 ID 사용
              
            console.log('[트랜잭션 페이지] 채팅 설정을 위한 거래 식별자:', transactionIdentifier);
            
            // 채팅 설정을 한번에 객체로 생성 후 로그 출력
            const chatConfig = {
              transactionId: transactionIdentifier,
              userId,
              userRole,
              otherUserId: userRole === 'buyer' 
                ? purchaseData.purchase.seller.id.toString() 
                : purchaseData.purchase.buyer.id.toString()
            };
            
            console.log('[트랜잭션 페이지] 채팅 설정:', chatConfig);
            setChatProps(chatConfig);
            setChatReady(true);
            console.log('[트랜잭션 페이지] 채팅 준비 완료, ready 상태:', true);
          } else {
            console.warn('[트랜잭션 페이지] 구매자 또는 판매자 ID가 없어 채팅을 초기화할 수 없습니다.');
          }
          
          // 중요: 로딩 상태 해제
          setIsLoading(false);
        } catch (error) {
          console.error('거래 정보 로딩 오류:', error);
          // 오류 메시지에서 상태 코드 추출 시도
          let errorStatus = 500;
          let errorMessage = '거래 정보를 가져오는데 문제가 발생했습니다.';
          
          if (error instanceof Error) {
            const statusMatch = error.message.match(/API 오류 \((\d+)\)/);
            if (statusMatch && statusMatch[1]) {
              errorStatus = parseInt(statusMatch[1]);
            }
            errorMessage = error.message;
          }
          
          setFetchError({status: errorStatus, message: errorMessage});
          setIsLoading(false);
        }
      } catch (error) {
        console.error('거래 정보 로딩 오류:', error);
        setFetchError({status: 500, message: '거래 정보를 가져오는데 문제가 발생했습니다.'});
        setIsLoading(false);
      }
    };
    
    fetchTransactionData();
  }, [params?.id, toast]);

  // 메시지 가져오기 상태를 추적하는 ref
  const fetchMessageAttemptedRef = useRef(false);
  
  // 채팅 준비가 완료되면 메시지 가져오기
  useEffect(() => {
    if (chatReady && fetchMessages && !fetchMessageAttemptedRef.current) {
      console.log('[트랜잭션 페이지] 채팅 준비 완료, 메시지 가져오기 시도', {
        chatReady,
        chatProps,
        hasProps: !!chatProps
      });
      
      fetchMessageAttemptedRef.current = true;
      console.log('서버에서 메시지 가져오기 시도...');
      fetchMessages({ force: true }) // 객체 형태의 매개변수로 수정
        .then(success => {
          if (success) {
            console.log('메시지 가져오기 성공');
          } else {
            console.error('메시지 가져오기 실패');
          }
        })
        .catch(error => {
          console.error('메시지 가져오기 오류:', error);
        });
    }
  }, [chatReady, fetchMessages]);

  // 상태 텍스트 변환 함수
  function getStatusText(status: string): string {
    switch (status) {
      case 'PENDING': return '결제 완료';
      case 'PROCESSING': return '취켓팅 시작';
      case 'COMPLETED': return '취켓팅 완료';
      case 'CONFIRMED': return '거래 확정';
      default: return '진행중';
    }
  }
  
  // 취켓팅 상태 텍스트 변환 함수
  function getTicketingStatusText(status: string): string {
    switch (status) {
      case 'PENDING': return '취켓팅 대기중';
      case 'PROCESSING': return '취켓팅 진행중';
      case 'COMPLETED': return '취켓팅 완료';
      case 'CONFIRMED': return '거래 확정';
      default: return '진행중';
    }
  }

  // 상태 변경 함수 개선
  const handleStatusChange = async (newStatus: string) => {
    if (!transaction || !params?.id || isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      console.log(`상태 변경 요청: ${newStatus}, 거래 ID: ${params.id}`);
      
      // 로컬 스토리지에서 토큰 가져오기
      const authToken = localStorage.getItem('token') || '';
      
      // API 호출
      const response = await fetch(`/api/purchase/${params.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      console.log('상태 변경 API 응답 상태:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = '상태 변경에 실패했습니다';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          console.error('오류 응답을 JSON으로 파싱할 수 없음:', e);
        }
        
        console.error('상태 변경 API 오류:', response.status, errorMessage);
        throw new Error(`API 오류 (${response.status}): ${errorMessage}`);
      }
      
      const data = await response.json();
      console.log('상태 변경 성공:', data);
      
      // CONFIRMED 상태로 변경 성공했을 때 화려한 효과들 표시
      if (newStatus === 'CONFIRMED' && isBrowser) {
        // Confetti 실행
        setConfettiRunning(true)
        setShowConfetti(true)
        
        // 축하 모달 표시
        setShowSuccessModal(true)
        
        // 추가 캔버스 효과 실행 (화면 중앙에서 퍼지는 효과)
        try {
          // 첫 번째 폭발
          canvasConfetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
          
          // 0.3초 후 두 번째 폭발
          setTimeout(() => {
            canvasConfetti({
              particleCount: 50,
              angle: 60,
              spread: 55,
              origin: { x: 0.2, y: 0.6 }
            });
          }, 300);
          
          // 0.6초 후 세 번째 폭발
          setTimeout(() => {
            canvasConfetti({
              particleCount: 50,
              angle: 120,
              spread: 55,
              origin: { x: 0.8, y: 0.6 }
            });
          }, 600);
        } catch (e) {
          console.error('캔버스 효과 오류:', e);
        }
        
        // 성공 메시지 강조 표시
        toast({
          title: '🎉 구매 확정 완료!',
          description: '거래가 성공적으로 완료되었습니다. 이용해주셔서 감사합니다!',
          variant: 'default',
          duration: 5000,
        });
        
        // 7초 후에 confetti 제거
        setTimeout(() => {
          setShowConfetti(false)
          setConfettiRunning(false)
        }, 7000)
        
        // 10초 후에 모달 제거
        setTimeout(() => {
          setShowSuccessModal(false)
        }, 10000)
      } else {
        // 다른 상태에 대한 일반 성공 메시지
        toast({
          title: '상태 변경 성공',
          description: data.message || '거래 상태가 업데이트되었습니다.',
        });
      }
      
      // 페이지 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('상태 변경 오류:', error);
      toast({
        title: '상태 변경 실패',
        description: error instanceof Error ? error.message : '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 거래 단계 정의 - 결제 완료부터 구매 확정까지의 모든 단계 표시
  const transactionSteps = [
    {
      id: "PENDING",
      label: "결제 완료",
      icon: <CreditCard className="w-5 h-5" />,
      date: transaction?.stepDates?.payment
        ? new Date(transaction.stepDates.payment).toLocaleDateString("ko-KR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        : ""
    },
    {
      id: "PROCESSING",
      label: "취켓팅 시작",
      icon: <Play className="w-5 h-5" />,
      date: transaction?.stepDates?.ticketing_started
        ? new Date(transaction.stepDates.ticketing_started).toLocaleDateString("ko-KR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        : ""
    },
    {
      id: "COMPLETED",
      label: "취켓팅 완료",
      icon: <CheckCircle className="w-5 h-5" />,
      date: transaction?.stepDates?.ticketing_completed
        ? new Date(transaction.stepDates.ticketing_completed).toLocaleDateString("ko-KR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        : ""
    },
    {
      id: "CONFIRMED",
      label: "구매 확정",
      icon: <ThumbsUp className="w-5 h-5" />,
      date: transaction?.stepDates?.confirmed
        ? new Date(transaction.stepDates.confirmed).toLocaleDateString("ko-KR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        : ""
    }
  ];
  
  // 액션 버튼 (확인 버튼) 클릭 핸들러
  const handleAction = async () => {
    if (transaction?.currentStep === "COMPLETED" && currentUserRole === 'buyer') {
      // 구매자: 취켓팅 완료 확인 (구매 확정) 로직
      handleStatusChange('CONFIRMED');
    } else if (transaction?.currentStep === "CONFIRMED") {
      // 이미 확정된 경우 리뷰 작성 페이지로 이동
      router.push(`/review/${transaction.id}?role=${currentUserRole}`)
    }
  }

  // 구매 확정 요청 함수 - 알림만 보내고 상태는 변경하지 않음
  const handleConfirmationRequest = async () => {
    if (!transaction || !params?.id || isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      console.log(`구매 확정 요청 알림 전송: 거래 ID: ${params.id}`);
      
      // 로컬 스토리지에서 토큰 가져오기
      const authToken = localStorage.getItem('token') || '';
      
      // API 호출 (알림만 보냄)
      const response = await fetch(`/api/purchase/${params.id}/confirmation-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      console.log('구매 확정 요청 API 응답 상태:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = '구매 확정 요청 알림 전송에 실패했습니다';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          console.error('오류 응답을 JSON으로 파싱할 수 없음:', e);
        }
        
        console.error('구매 확정 요청 API 오류:', response.status, errorMessage);
        throw new Error(`API 오류 (${response.status}): ${errorMessage}`);
      }
      
      const data = await response.json();
      console.log('구매 확정 요청 알림 전송 성공:', data);
      
      // 성공 메시지 표시
      toast({
        title: '구매 확정 요청 완료',
        description: data.message || '구매자에게 구매 확정 요청 알림이 전송되었습니다.',
      });
      
    } catch (error) {
      console.error('구매 확정 요청 오류:', error);
      toast({
        title: '구매 확정 요청 실패',
        description: error instanceof Error ? error.message : '구매 확정 요청 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openChat = () => setIsChatOpen(true)
  const closeChat = () => setIsChatOpen(false)

  // 로딩 상태 표시
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">거래 정보를 불러오는 중입니다...</p>
          <p className="text-sm text-gray-500 mt-2">ID: {params?.id}</p>
          <div className="mt-4 animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <Button 
            onClick={() => window.location.reload()} 
            className="mt-6"
          >
            페이지 새로고침
          </Button>
        </div>
      </div>
    )
  }
  
  // 거래 정보를 찾을 수 없는 경우(404 오류) 전용 오류 페이지 표시
  if (fetchError && (fetchError.status === 404 || fetchError.message.includes("찾을 수 없습니다"))) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <Image 
              src="/not-found.svg" 
              alt="거래를 찾을 수 없음" 
              width={150} 
              height={150} 
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">거래를 찾을 수 없습니다</h1>
          <p className="text-gray-600 mb-6">
            요청하신 거래 정보가 존재하지 않거나 접근할 수 없습니다. 
            올바른 거래 정보인지 확인해주세요.
          </p>
          <div className="flex flex-col space-y-3">
            <Button 
              onClick={() => router.push('/mypage')} 
              className="w-full bg-primary hover:bg-primary-dark"
            >
              마이페이지로 이동
            </Button>
            <Button 
              onClick={() => router.push('/')} 
              variant="outline" 
              className="w-full"
            >
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  // 그 외 일반 오류의 경우
  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">오류가 발생했습니다</h1>
          <p className="text-gray-600 mb-6">
            {fetchError.message}
          </p>
          <div className="flex flex-col space-y-3">
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-primary hover:bg-primary-dark"
            >
              새로고침
            </Button>
            <Button 
              onClick={() => router.push('/mypage')} 
              variant="outline" 
              className="w-full"
            >
              마이페이지로 이동
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Confetti 효과 추가 - 클라이언트 사이드에서만 렌더링 */}
      {isBrowser && showConfetti && (
        <ReactConfetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={confettiRunning ? 500 : 0}
          recycle={false}
          tweenDuration={8000}
          gravity={0.15}
          colors={['#0061FF', '#FFD600', '#60A5FA', '#34D399', '#F59E0B', '#EC4899', '#8B5CF6']}
        />
      )}
      
      {/* 성공 축하 모달 */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 15 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center relative overflow-hidden"
            >
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="absolute -top-10 -left-10 w-32 h-32 bg-blue-500/10 rounded-full"
              />
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="absolute -bottom-12 -right-12 w-40 h-40 bg-yellow-500/10 rounded-full"
              />
              
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 15, 0, -15, 0] }}
                transition={{ delay: 0.5, duration: 1 }}
                className="w-24 h-24 bg-blue-500 rounded-full mx-auto flex items-center justify-center mb-6"
              >
                <Award className="w-12 h-12 text-white" />
              </motion.div>
              
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-2xl font-bold text-gray-900 mb-3"
              >
                구매 확정 완료!
              </motion.h2>
              
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="text-gray-600 mb-8"
              >
                성공적으로 거래가 완료되었습니다. <br />
                즐거운 공연 관람 되세요!
              </motion.p>
              
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.1 }}
              >
                <Button 
                  onClick={() => setShowSuccessModal(false)}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-8 py-3 rounded-full 
                           hover:shadow-lg transition-all duration-300 hover:scale-105"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  확인했어요
                </Button>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/mypage"
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span>대시보드로 돌아가기</span>
          </Link>
          <h1 className="text-3xl font-bold mt-4">거래 상세</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6 transition-all duration-300 hover:shadow-md">
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <div>
                <span className="text-sm text-gray-500 mb-1 block">티켓 정보</span>
                <h2 className="text-2xl font-bold text-gray-900">{transaction?.ticket?.title || "티켓 정보"}</h2>
              </div>
            </div>

            {/* 거래 진행 상태 스텝퍼 */}
            <div className="mb-10 bg-gray-50 p-6 rounded-xl border border-gray-100">
              <h3 className="text-lg font-semibold mb-6 text-gray-800">거래 진행 상태</h3>
              <TransactionStepper currentStep={transaction?.currentStep || ""} steps={transactionSteps} />
            </div>

            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-1/3">
                <div className="relative h-60 md:h-full w-full rounded-xl overflow-hidden shadow-sm">
                  <Image
                    src={transaction?.ticket?.image || "/placeholder.svg"}
                    alt={transaction?.ticket?.title || "티켓 이미지"}
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
              </div>
              <div className="md:w-2/3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                    <Calendar className="h-5 w-5 mr-3 text-blue-500" />
                    <div>
                      <span className="text-xs text-gray-500 block">공연 날짜</span>
                      <span className="font-medium">{transaction?.ticket?.date || "날짜 정보 없음"}</span>
                    </div>
                  </div>
                  <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                    <Clock className="h-5 w-5 mr-3 text-blue-500" />
                    <div>
                      <span className="text-xs text-gray-500 block">공연 시간</span>
                      <span className="font-medium">{transaction?.ticket?.time || "시간 정보 없음"}</span>
                    </div>
                  </div>
                  <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                    <MapPin className="h-5 w-5 mr-3 text-blue-500" />
                    <div>
                      <span className="text-xs text-gray-500 block">공연 장소</span>
                      <span className="font-medium">{transaction?.ticket?.venue || "장소 정보 없음"}</span>
                    </div>
                  </div>
                  <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                    <CreditCard className="h-5 w-5 mr-3 text-blue-500" />
                    <div>
                      <span className="text-xs text-gray-500 block">결제 금액</span>
                      <span className="font-medium">{transaction?.price ? transaction.price.toLocaleString() : 0}원</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-full mr-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-blue-600"
                      >
                        <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                        <path d="M15 3v6h6" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-xs text-blue-600 block">좌석 정보</span>
                      <span className="font-medium text-blue-800">{transaction?.ticket?.seat || "좌석 정보 없음"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 border-t pt-8">
              <h3 className="text-xl font-semibold mb-6 text-gray-800">결제 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500 block mb-1">결제 방법</span>
                  <span className="font-medium">{transaction?.paymentMethod || "신용카드"}</span>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500 block mb-1">결제 상태</span>
                  <span className="font-medium text-green-600">{transaction?.paymentStatus || "결제 정보 없음"}</span>
                </div>
              </div>
            </div>

            <div className="mt-10 border-t pt-8">
              <h3 className="text-xl font-semibold mb-6 text-gray-800">취켓팅 정보</h3>

              <TicketingStatusCard
                status={transaction?.currentStep === "COMPLETED" ? "completed" : "in_progress"}
                message={transaction?.currentStep === "COMPLETED" 
                  ? "취켓팅이 완료되었습니다. 판매자가 성공적으로 티켓을 구매했습니다. 아래 버튼을 눌러 구매를 확정해주세요." 
                  : " 취켓팅 완료 이후, 아래의 취켓팅 완료하기 버튼을 눌러주세요."}
                updatedAt={transaction?.currentStep === "COMPLETED"
                  ? (transaction?.stepDates?.ticketing_completed 
                    ? new Date(transaction.stepDates.ticketing_completed).toLocaleString() 
                    : "날짜 정보 없음")
                  : "진행중"}
              />

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500 block mb-1">취켓팅 상태</span>
                  <span className="font-medium text-blue-600">
                    {transaction?.currentStep === "COMPLETED" ? "취켓팅 완료" : transaction?.ticketingStatus || "진행중"}
                  </span>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500 block mb-1">판매자 정보</span>
                  <Link 
                    href={`/profile/${transaction?.seller?.id}`} 
                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2"
                  >
                    {transaction?.seller?.profileImage && (
                      <Image 
                        src={transaction.seller.profileImage} 
                        alt={transaction.seller.name || "판매자"} 
                        width={24} 
                        height={24} 
                        className="rounded-full"
                      />
                    )}
                    {transaction?.seller?.name || "판매자 정보 없음"}
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-4">
              <Button 
                onClick={openChat} 
                variant="outline" 
                className="flex items-center gap-2 border-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {currentUserRole === 'buyer' ? '판매자에게 메시지' : '구매자에게 메시지'}
              </Button>

              {/* 구매자인 경우 구매 확정 버튼 - 취켓팅 시작 상태 */}
              {currentUserRole === 'buyer' && transaction?.currentStep === "PROCESSING" && (
                <div className="flex flex-col gap-2 items-end">
                  <Button
                    disabled={true}  
                    className="bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-md cursor-not-allowed"
                  >
                    구매 확정하기
                  </Button>
                  <p className="text-sm text-gray-500">
                    판매자가 취켓팅 완료 버튼을 누른 후 구매 확정 버튼이 활성화됩니다.
                  </p>
                </div>
              )}

              {/* 구매자인 경우 구매 확정 버튼 - 취켓팅 완료 상태 */}
              {currentUserRole === 'buyer' && transaction?.currentStep === "COMPLETED" && (
                <div className="flex flex-col gap-2 items-end">
                  <Button
                    onClick={handleAction}
                    disabled={isSubmitting}  
                    className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                  >
                    {isSubmitting ? '처리 중...' : (
                      <>
                        <Star className="w-5 h-5" />
                        구매 확정하기
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-blue-500">
                    구매가 확정되면 판매자에게 대금이 지급됩니다.
                  </p>
                </div>
              )}

              {/* 판매자인 경우 구매 확정 요청 버튼 추가 */}
              {currentUserRole === 'seller' && transaction?.currentStep === "COMPLETED" && (
                <Button
                  onClick={handleConfirmationRequest}
                  disabled={isSubmitting}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg shadow-md"
                >
                  {isSubmitting ? '처리 중...' : '구매 확정 요청하기'}
                </Button>
              )}

              {/* 판매자인 경우 상태 변경 버튼 - 취켓팅 시작 버튼 제거하고 바로 완료하기 버튼 표시 */}
              {currentUserRole === 'seller' && transaction?.currentStep === "PROCESSING" && (
                <Button
                  onClick={() => handleStatusChange('COMPLETED')}
                  disabled={isSubmitting}
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-lg shadow-md"
                >
                  {isSubmitting ? '처리 중...' : '취켓팅 완료하기'}
                </Button>
              )}

              {transaction?.currentStep === "CONFIRMED" && (
                <Button
                  onClick={handleAction}
                  className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-6 py-3 rounded-lg shadow-md"
                >
                  리뷰 작성하기
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ChatInterface 컴포넌트 사용 */}
      <ChatInterface 
        isOpen={isChatOpen}
        onClose={closeChat}
        messages={messages}
        isLoading={isMessagesLoading}
        onSendMessage={handleSendMessage}
        onMarkAsRead={handleMarkAsRead}
        otherUserName={currentUserRole === 'buyer' 
          ? transaction?.seller?.name || "판매자" 
          : transaction?.buyer?.name || "구매자"}
        otherUserProfileImage={currentUserRole === 'buyer' 
          ? transaction?.seller?.profileImage 
          : transaction?.buyer?.profileImage}
        otherUserRole={currentUserRole === 'buyer' ? "판매자" : "구매자"}
      />
    </div>
  )
}

