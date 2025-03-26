import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// 메시지 읽음 상태 조회 API 핸들러
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get('roomId');
    const messageId = searchParams.get('messageId');
    
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
    
    // 특정 메시지 ID가 제공된 경우
    if (messageId) {
      const messageIdInt = parseInt(messageId);
      if (isNaN(messageIdInt)) {
        return NextResponse.json(
          { error: '유효하지 않은 메시지 ID입니다.' },
          { status: 400 }
        );
      }
      
      const message = await prisma.message.findUnique({
        where: { id: messageIdInt }
      });
      
      if (!message) {
        return NextResponse.json(
          { error: '메시지를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      
      // 메시지의 발신자만 읽음 상태를 확인할 수 있음
      if (message.senderId !== userId) {
        return NextResponse.json(
          { error: '이 메시지의 읽음 상태를 확인할 권한이 없습니다.' },
          { status: 403 }
        );
      }
      
      return NextResponse.json({
        success: true,
        messageId: message.id,
        isRead: message.isRead,
        senderId: message.senderId,
        receiverId: message.receiverId,
        timestamp: message.createdAt
      });
    }
    
    // 채팅방 ID가 제공된 경우
    if (roomId) {
      // roomId를 방 이름으로 사용하는 경우
      const room = await prisma.room.findFirst({
        where: { name: roomId }
      });
      
      if (!room) {
        return NextResponse.json(
          { error: '채팅방을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      
      // 사용자가 채팅방의 참여자인지 확인
      const isParticipant = await prisma.roomParticipant.findFirst({
        where: {
          roomId: room.id,
          userId
        }
      });
      
      if (!isParticipant) {
        return NextResponse.json(
          { error: '이 채팅방에 접근할 권한이 없습니다.' },
          { status: 403 }
        );
      }
      
      // 사용자가 보낸 메시지 중 읽음 상태 확인
      const messages = await prisma.message.findMany({
        where: {
          roomId: room.id,
          senderId: userId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      // 읽지 않은 메시지 개수
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      
      return NextResponse.json({
        success: true,
        roomId: roomId,
        totalMessages: messages.length,
        unreadCount,
        readCount: messages.length - unreadCount,
        messages: messages.map(msg => ({
          id: msg.id,
          content: msg.content.substring(0, 30) + (msg.content.length > 30 ? '...' : ''),
          isRead: msg.isRead,
          timestamp: msg.createdAt
        }))
      });
    }
    
    return NextResponse.json(
      { error: 'roomId 또는 messageId 파라미터가 필요합니다.' },
      { status: 400 }
    );
    
  } catch (error: any) {
    console.error('[API] 메시지 읽음 상태 조회 오류:', error);
    return NextResponse.json(
      { 
        error: '메시지 읽음 상태 조회 중 오류가 발생했습니다.',
        details: error.message
      },
      { status: 500 }
    );
  }
} 