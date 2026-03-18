import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  buildMutationPayload,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  mutationOk,
  publishOpsMutation,
  releaseIdempotentMutation,
  requireBillingAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';
import { resolveBillingContext } from '@/app/api/ops/_billing';
import {
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
  OPS_SCOPE_WAITER,
} from '@/lib/ops/workspaceScopes';

type SettleAllocationInput = {
  orderItemId: string;
  quantity: number;
};

type SettleAndCloseRequestBody = {
  allocations?: SettleAllocationInput[];
};

type SettleAndCloseRpcResult = {
  ok?: boolean;
  payment_id?: string;
  total_amount?: number | string;
  total_quantity?: number | string;
  service_session_id?: string;
  session_closed?: boolean;
  session_status?: string;
  waiting_qty?: number | string;
  ready_undelivered_qty?: number | string;
  billable_qty?: number | string;
};

const MUTATION_SCOPES = [
  OPS_SCOPE_WAITER,
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
] as const;

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { allocations } = (await req.json()) as SettleAndCloseRequestBody;
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const billing = await resolveBillingContext(ctx.cafeId, ctx.databaseKey, allocations);

    const started = await beginIdempotentMutation(req, ctx, 'ops.billing.settle-and-close', {
      shiftId: billing.shiftId,
      serviceSessionId: billing.serviceSessionId,
      lines: billing.lines,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const rpc = await callOpsRpc<SettleAndCloseRpcResult>('ops_settle_selected_quantities_and_try_close_session', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: billing.shiftId,
      p_service_session_id: billing.serviceSessionId,
      p_lines: billing.lines,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const paymentId = String(rpc.payment_id ?? '').trim();
    const sessionId = String(rpc.service_session_id ?? billing.serviceSessionId).trim();
    if (!rpc.ok || !paymentId || !sessionId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_settle_selected_quantities_and_try_close_session');
    }

    const totalAmount = Number(rpc.total_amount ?? 0);
    const totalQuantity = Number(rpc.total_quantity ?? 0);
    const sessionClosed = Boolean(rpc.session_closed);
    const waitingQty = Number(rpc.waiting_qty ?? 0);
    const readyUndeliveredQty = Number(rpc.ready_undelivered_qty ?? 0);
    const billableQty = Number(rpc.billable_qty ?? 0);

    publishOpsMutation(ctx, {
      type: 'billing.settled',
      entityId: paymentId,
      shiftId: billing.shiftId,
      data: { serviceSessionId: sessionId, totalAmount, totalQuantity, sessionClosed },
    });

    if (sessionClosed) {
      publishOpsMutation(ctx, {
        type: 'session.closed',
        entityId: sessionId,
        shiftId: billing.shiftId,
      });
    }

    const responseBody = buildMutationPayload({
      data: {
        paymentId,
        sessionId,
        totalAmount,
        totalQuantity,
        sessionClosed,
        sessionStatus: String(rpc.session_status ?? (sessionClosed ? 'closed' : 'open')),
        waitingQty,
        readyUndeliveredQty,
        billableQty,
      },
      mutation: {
        type: sessionClosed ? 'session.closed' : 'billing.settled',
        scopes: [...MUTATION_SCOPES],
        entityId: sessionClosed ? sessionId : paymentId,
        shiftId: billing.shiftId,
      },
    });
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return mutationOk({
      data: {
        paymentId,
        sessionId,
        totalAmount,
        totalQuantity,
        sessionClosed,
        sessionStatus: String(rpc.session_status ?? (sessionClosed ? 'closed' : 'open')),
        waitingQty,
        readyUndeliveredQty,
        billableQty,
      },
      mutation: {
        type: sessionClosed ? 'session.closed' : 'billing.settled',
        scopes: [...MUTATION_SCOPES],
        entityId: sessionClosed ? sessionId : paymentId,
        shiftId: billing.shiftId,
      },
    });
  } catch (e) {
    if (mutation) {
      try {
        const ctx = await requireOpsActorContext();
        await releaseIdempotentMutation(ctx, mutation);
      } catch {}
    }
    return jsonError(e, 400);
  }
}
