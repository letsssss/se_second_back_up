import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// 서비스 롤 키를 사용하여 Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateUsers() {
  console.log('사용자 마이그레이션 시작...');
  const users = await prisma.user.findMany();

  for (const user of users) {
    // 1. Supabase Auth에 사용자 생성
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'TemporaryPassword123!', // 임시 비밀번호 설정 (후에 변경 요청)
      email_confirm: true, // 이메일 확인됨으로 설정
      user_metadata: {
        name: user.name,
        role: user.role,
      },
    });

    if (authError) {
      console.error(`사용자 ${user.email} 마이그레이션 실패:`, authError);
      continue;
    }

    // 2. Supabase 데이터베이스에 추가 사용자 정보 저장
    const { error: dbError } = await supabase
      .from('User')
      .insert({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        bankInfo: user.bankInfo,
        auth_id: authUser.user?.id,
      });

    if (dbError) {
      console.error(`사용자 ${user.email} 추가 정보 저장 실패:`, dbError);
      continue;
    }

    console.log(`사용자 ${user.email} 마이그레이션 완료`);
  }

  console.log('사용자 마이그레이션 완료');
}

async function migratePosts() {
  console.log('게시글 마이그레이션 시작...');
  const posts = await prisma.post.findMany();

  for (const post of posts) {
    const { error } = await supabase
      .from('Post')
      .insert({
        id: post.id.toString(), // BigInt를 문자열로 변환
        title: post.title,
        content: post.content,
        category: post.category,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        authorId: post.authorId,
        isDeleted: post.isDeleted,
        viewCount: post.viewCount,
        eventName: post.eventName,
        eventDate: post.eventDate,
        eventVenue: post.eventVenue,
        ticketPrice: post.ticketPrice ? post.ticketPrice.toString() : null, // BigInt를 문자열로 변환
        contactInfo: post.contactInfo,
        status: post.status,
      });

    if (error) {
      console.error(`게시글 ID ${post.id} 마이그레이션 실패:`, error);
      continue;
    }

    console.log(`게시글 ID ${post.id} 마이그레이션 완료`);
  }

  console.log('게시글 마이그레이션 완료');
}

async function migrateNotifications() {
  console.log('알림 마이그레이션 시작...');
  const notifications = await prisma.notification.findMany();

  for (const notification of notifications) {
    const { error } = await supabase
      .from('Notification')
      .insert({
        id: notification.id,
        userId: notification.userId,
        postId: notification.postId ? notification.postId.toString() : null, // BigInt를 문자열로 변환
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      });

    if (error) {
      console.error(`알림 ID ${notification.id} 마이그레이션 실패:`, error);
      continue;
    }

    console.log(`알림 ID ${notification.id} 마이그레이션 완료`);
  }

  console.log('알림 마이그레이션 완료');
}

async function migratePurchases() {
  console.log('구매 정보 마이그레이션 시작...');
  const purchases = await prisma.purchase.findMany();

  for (const purchase of purchases) {
    const { error } = await supabase
      .from('Purchase')
      .insert({
        id: purchase.id,
        orderNumber: purchase.orderNumber,
        buyerId: purchase.buyerId,
        sellerId: purchase.sellerId,
        postId: purchase.postId ? purchase.postId.toString() : null, // BigInt를 문자열로 변환
        quantity: purchase.quantity,
        totalPrice: purchase.totalPrice.toString(), // BigInt를 문자열로 변환
        status: purchase.status,
        paymentMethod: purchase.paymentMethod,
        selectedSeats: purchase.selectedSeats,
        phoneNumber: purchase.phoneNumber,
        ticketTitle: purchase.ticketTitle,
        eventDate: purchase.eventDate,
        eventVenue: purchase.eventVenue,
        ticketPrice: purchase.ticketPrice ? purchase.ticketPrice.toString() : null, // BigInt를 문자열로 변환
        imageUrl: purchase.imageUrl,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt,
      });

    if (error) {
      console.error(`구매 정보 ID ${purchase.id} 마이그레이션 실패:`, error);
      continue;
    }

    console.log(`구매 정보 ID ${purchase.id} 마이그레이션 완료`);
  }

  console.log('구매 정보 마이그레이션 완료');
}

async function migrateAll() {
  try {
    // 먼저 사용자를 마이그레이션
    await migrateUsers();
    
    // 그 다음 게시글 마이그레이션
    await migratePosts();
    
    // 알림 마이그레이션
    await migrateNotifications();
    
    // 구매 정보 마이그레이션
    await migratePurchases();
    
    // 추가로 필요한 다른 테이블들도 마이그레이션...
    
    console.log('모든 데이터 마이그레이션이 완료되었습니다!');
  } catch (error) {
    console.error('마이그레이션 중 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 마이그레이션 실행
migrateAll(); 