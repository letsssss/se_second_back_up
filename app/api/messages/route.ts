import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// 메시지 API 핸들러
export async function POST(request: NextRequest) {
  try {
    // 1. 요청 본문 파싱
    const body = await request.json();
    const { content, senderId, receiverId, purchaseId } = body;
    
    // 2. 필수 필드 검증
    if (!content || !senderId) {
      return NextResponse.json(
        { error: '필수 항목이 누락되었습니다 (content, senderId 필수)' },
        { status: 400 }
      );
    }
    
    // 3. 인증 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded || typeof decoded !== 'object' || !('userId' in decoded)) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }
    
    // 4. 토큰의 사용자 ID와 요청 본문의 발신자 ID가 일치하는지 확인
    const tokenUserId = parseInt(decoded.userId.toString());
    const requestSenderId = parseInt(senderId.toString());
    
    if (tokenUserId !== requestSenderId) {
      return NextResponse.json(
        { error: '토큰의 사용자 ID와, 요청한 발신자 ID가 일치하지 않습니다.' },
        { status: 403 }
      );
    }
    
    // 5. 채팅방 정보 조회
    let room = null;
    
    if (purchaseId) {
      // purchaseId를 다양한 형식으로 처리
      let purchaseIdInt;
      let purchase;
      
      // 숫자로 직접 표현된 경우
      if (!isNaN(Number(purchaseId))) {
        purchaseIdInt = parseInt(purchaseId);
        purchase = await prisma.purchase.findFirst({
          where: { id: purchaseIdInt }
        });
      } 
      // 주문번호(문자열) 형식인 경우
      else {
        // 주문번호로 구매 정보 조회
        purchase = await prisma.purchase.findFirst({
          where: { orderNumber: purchaseId }
        });
        
        if (purchase) {
          purchaseIdInt = purchase.id;
        }
      }
      
      if (!purchase) {
        return NextResponse.json(
          { error: '유효하지 않은 구매 ID 또는 주문번호입니다.' },
          { status: 400 }
        );
      }
      
      // 구매 ID가 있는 경우 해당 구매에 연결된 채팅방 조회
      room = await prisma.room.findFirst({
        where: {
          purchaseId: purchaseIdInt,
        }
      });
      
      // 채팅방이 없으면 생성
      if (!room) {
        // 채팅방 생성
        room = await prisma.room.create({
          data: {
            name: `purchase_${purchaseIdInt}`,
            purchaseId: purchaseIdInt,
            participants: {
              create: [
                { userId: purchase.buyerId },
                { userId: purchase.sellerId }
              ]
            }
          }
        });
      }
    }
    
    // receiverId 처리 - undefined인 경우 Prisma 오류 방지
    let finalReceiverId = null;
    if (receiverId) {
      finalReceiverId = parseInt(receiverId.toString());
      if (isNaN(finalReceiverId)) {
        finalReceiverId = null;
      }
    }

    // 상대방 ID가 없고 구매 ID가 있는 경우, 구매 정보에서 상대방 ID 추출
    if (!finalReceiverId && room) {
      const participants = await prisma.roomParticipant.findMany({
        where: { roomId: room.id }
      });
      
      for (const participant of participants) {
        if (participant.userId !== requestSenderId) {
          finalReceiverId = participant.userId;
          break;
        }
      }
      
      // 참여자가 없거나 자신만 있는 경우
      if (!finalReceiverId) {
        return NextResponse.json(
          { error: '메시지를 받을 수신자를 찾을 수 없습니다.' },
          { status: 400 }
        );
      }
    }
    
    // 6. 메시지 저장
    const messageData: any = {
      content,
      senderId: requestSenderId,
    };
    
    // 선택적 필드 추가
    if (finalReceiverId) {
      messageData.receiverId = finalReceiverId;
    } else if (room && room.purchaseId) {
      // room이 있으면서 receiverId가 없는 경우, 임시로 senderId를 receiverId로 설정
      // 이 부분은 스키마에 따라 조정 필요
      messageData.receiverId = requestSenderId;
    } else {
      return NextResponse.json(
        { error: '메시지 수신자 정보가 필요합니다.' },
        { status: 400 }
      );
    }
    
    if (room?.id) {
      messageData.roomId = room.id;
    }
    
    if (room?.purchaseId) {
      messageData.purchaseId = room.purchaseId;
    }
    
    const message = await prisma.message.create({
      data: messageData
    });
    
    // 7. 채팅방 정보 업데이트
    if (room) {
      await prisma.room.update({
        where: { id: room.id },
        data: {
          lastChat: content,
          timeOfLastChat: new Date()
        }
      });
    }
    
    // 8. 성공 응답 반환
    return NextResponse.json({
      success: true,
      messageId: message.id,
      message: '메시지가 성공적으로 전송되었습니다.'
    });
  } catch (error: any) {
    console.error('[API] 메시지 전송 오류:', error);
    return NextResponse.json(
      { 
        error: '메시지 전송 중 오류가 발생했습니다.',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// 메시지 조회 핸들러
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get('roomId');
    const purchaseId = searchParams.get('purchaseId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // 인증 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded || typeof decoded !== 'object' || !('userId' in decoded)) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }
    
    const userId = parseInt(decoded.userId.toString());
    
    // 조회 조건 설정
    const whereCondition: any = {};
    
    if (roomId) {
      const roomIdInt = parseInt(roomId);
      if (isNaN(roomIdInt)) {
        return NextResponse.json(
          { error: '유효하지 않은 채팅방 ID입니다.' },
          { status: 400 }
        );
      }
      
      whereCondition.roomId = roomIdInt;
      
      // 사용자가 해당 채팅방의 참여자인지 확인
      const isParticipant = await prisma.roomParticipant.findFirst({
        where: {
          roomId: roomIdInt,
          userId
        }
      });
      
      if (!isParticipant) {
        return NextResponse.json(
          { error: '채팅방에 접근할 권한이 없습니다.' },
          { status: 403 }
        );
      }
    } else if (purchaseId) {
      // purchaseId를 다양한 형식으로 처리
      let purchaseIdInt;
      let purchase;
      
      // 숫자로 직접 표현된 경우
      if (!isNaN(Number(purchaseId))) {
        purchaseIdInt = parseInt(purchaseId);
        purchase = await prisma.purchase.findFirst({
          where: { id: purchaseIdInt }
        });
      } 
      // 주문번호(문자열) 형식인 경우
      else {
        // 주문번호로 구매 정보 조회
        purchase = await prisma.purchase.findFirst({
          where: { orderNumber: purchaseId }
        });
        
        if (purchase) {
          purchaseIdInt = purchase.id;
        }
      }
      
      if (!purchase) {
        return NextResponse.json(
          { error: '유효하지 않은 구매 ID 또는 주문번호입니다.' },
          { status: 400 }
        );
      }
      
      whereCondition.purchaseId = purchaseIdInt;
      
      // 사용자가 해당 구매의 구매자 또는 판매자인지 확인
      if (purchase.buyerId !== userId && purchase.sellerId !== userId) {
        return NextResponse.json(
          { error: '해당 거래에 접근할 권한이 없습니다.' },
          { status: 403 }
        );
      }
    } else {
      // roomId나 purchaseId 중 하나는 필수
      return NextResponse.json(
        { error: 'roomId 또는 purchaseId 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 메시지 조회
    const messages = await prisma.message.findMany({
      where: whereCondition,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
    
    // 메시지 읽음 상태 업데이트
    if (messages.length > 0 && roomId) {
      const unreadMessageIds = messages
        .filter(msg => msg.senderId !== userId && !msg.isRead)
        .map(msg => msg.id);
      
      if (unreadMessageIds.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: unreadMessageIds } },
          data: { isRead: true }
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        createdAt: msg.createdAt,
        isRead: msg.isRead,
        sender: msg.sender,
        receiver: msg.receiver
      })).reverse() // 최신 메시지가 아래로 가도록 역순 정렬
    });
  } catch (error: any) {
    console.error('[API] 메시지 조회 오류:', error);
    return NextResponse.json(
      { 
        error: '메시지 조회 중 오류가 발생했습니다.',
        details: error.message
      },
      { status: 500 }
    );
  }
} 