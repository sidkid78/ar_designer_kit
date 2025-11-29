// app/api/stripe/webhook/route.ts
// Stripe Webhook Handler - Source of truth for subscription status

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase-admin';

// Lazy initialization to avoid build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-11-17.clover',
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.firebaseUserId;
  
  if (!userId) {
    console.error('No user ID found in checkout session');
    return;
  }

  // Update user subscription status in Firestore
  await db.collection('users').doc(userId).update({
    'subscription.status': 'active',
    'subscription.plan': 'pro',
    'subscription.stripeCustomerId': session.customer as string,
    'subscription.stripeSubscriptionId': session.subscription as string,
    'subscription.updatedAt': new Date(),
  });

  console.log(`Subscription activated for user: ${userId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.firebaseUserId;
  
  if (!userId) {
    // Try to find user by Stripe customer ID
    const customerId = subscription.customer as string;
    const usersSnapshot = await db
      .collection('users')
      .where('subscription.stripeCustomerId', '==', customerId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.error('No user found for subscription:', subscription.id);
      return;
    }

    const userDoc = usersSnapshot.docs[0];
    await updateUserSubscription(userDoc.id, subscription);
    return;
  }

  await updateUserSubscription(userId, subscription);
}

async function updateUserSubscription(userId: string, subscription: Stripe.Subscription) {
  const status = subscription.status;
  const plan = status === 'active' || status === 'trialing' ? 'pro' : 'freemium';
  
  // Access subscription data - handle both snake_case API response and typed SDK
  const subData = subscription as unknown as Record<string, unknown>;
  const currentPeriodEnd = subData['current_period_end'] as number | undefined;
  const cancelAtPeriodEnd = subData['cancel_at_period_end'] as boolean | undefined;

  await db.collection('users').doc(userId).update({
    'subscription.status': status,
    'subscription.plan': plan,
    ...(currentPeriodEnd && { 'subscription.currentPeriodEnd': new Date(currentPeriodEnd * 1000) }),
    ...(cancelAtPeriodEnd !== undefined && { 'subscription.cancelAtPeriodEnd': cancelAtPeriodEnd }),
    'subscription.updatedAt': new Date(),
  });

  console.log(`Subscription updated for user: ${userId}, status: ${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.firebaseUserId;
  
  if (!userId) {
    const customerId = subscription.customer as string;
    const usersSnapshot = await db
      .collection('users')
      .where('subscription.stripeCustomerId', '==', customerId)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const userDoc = usersSnapshot.docs[0];
      await resetUserSubscription(userDoc.id);
    }
    return;
  }

  await resetUserSubscription(userId);
}

async function resetUserSubscription(userId: string) {
  await db.collection('users').doc(userId).update({
    'subscription.status': 'canceled',
    'subscription.plan': 'freemium',
    'subscription.updatedAt': new Date(),
  });

  console.log(`Subscription canceled for user: ${userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  
  const usersSnapshot = await db
    .collection('users')
    .where('subscription.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    const userDoc = usersSnapshot.docs[0];
    await db.collection('users').doc(userDoc.id).update({
      'subscription.status': 'past_due',
      'subscription.updatedAt': new Date(),
    });

    console.log(`Payment failed for user: ${userDoc.id}`);
  }
}

