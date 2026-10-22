CREATE TYPE "public"."analysis_depth" AS ENUM('standard', 'deep');--> statement-breakpoint
CREATE TYPE "public"."memory_mode" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."memory_storage_status" AS ENUM('queued', 'submitting', 'pending', 'stored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('awaiting_approval', 'approved', 'rejected', 'expired', 'settling', 'settled', 'failed', 'unknown', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('CREATED', 'PLANNING', 'RECALLING_MEMORY', 'SELECTING_TOOLS', 'EXECUTING', 'AWAITING_APPROVAL', 'VERIFYING', 'REFLECTING', 'SAVING_MEMORY', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_execution_step" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" "run_status",
	"title" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_failure" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"tool_id" text,
	"task_category" text,
	"expectation" text NOT NULL,
	"observed" text NOT NULL,
	"objectively_verified" boolean NOT NULL,
	"confirmed_cause" text,
	"hypotheses" jsonb NOT NULL,
	"corrective_strategy" text,
	"correction_validated" boolean DEFAULT false NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"verification_result_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "run_status" DEFAULT 'CREATED' NOT NULL,
	"task" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"task_category" text,
	"memory_mode" "memory_mode" DEFAULT 'enabled' NOT NULL,
	"analysis_depth" "analysis_depth" DEFAULT 'standard' NOT NULL,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"evaluation_run_id" text,
	"fault_injection" jsonb,
	"provider" text,
	"model" text,
	"limits" jsonb NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"model_iterations" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"model_cost_micro_usd" bigint,
	"checkpoint" jsonb,
	"final_report" jsonb,
	"tool_plan" jsonb,
	"error" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_wallet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"network" text NOT NULL,
	"wallet_name" text,
	"verified_at" timestamp with time zone,
	"challenge" text,
	"challenge_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_result" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_index" integer NOT NULL,
	"mode" text NOT NULL,
	"agent_run_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed" boolean,
	"verified_claims" integer,
	"contradicted_claims" integer,
	"unverified_claims" integer,
	"tool_calls" integer,
	"tool_failures" integer,
	"paid_spend_atomic" numeric(78, 0),
	"model_cost_micro_usd" bigint,
	"duration_ms" integer,
	"memories_retrieved" integer,
	"memories_applied" integer,
	"decisions_changed" jsonb,
	"repeated_errors" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"methodology" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"modes" jsonb NOT NULL,
	"fault_injection" jsonb,
	"provider" text,
	"model" text,
	"limits" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_record" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tool_execution_id" text,
	"provider" text NOT NULL,
	"network" text NOT NULL,
	"kind" text NOT NULL,
	"reference" text NOT NULL,
	"method" text NOT NULL,
	"checkpoint" text,
	"data" jsonb NOT NULL,
	"data_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_health_event" (
	"id" text PRIMARY KEY NOT NULL,
	"integration" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"last_run_id" text,
	"last_status" "run_status",
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"scope" text NOT NULL,
	"namespace" text NOT NULL,
	"memory_type" text NOT NULL,
	"task_category" text,
	"related_tool_id" text,
	"directive" text,
	"summary" text NOT NULL,
	"lesson" text NOT NULL,
	"evidence_references" jsonb NOT NULL,
	"verification_status" text NOT NULL,
	"source_run_id" text,
	"source_failure_id" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"storage_status" "memory_storage_status" DEFAULT 'queued' NOT NULL,
	"walrus_job_id" text,
	"walrus_blob_id" text,
	"walrus_owner" text,
	"storage_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"status" text DEFAULT 'active' NOT NULL,
	"supersedes_memory_id" text,
	"superseded_by_id" text,
	"flagged_reason" text,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stored_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memory_correction" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_id" text NOT NULL,
	"user_id" text NOT NULL,
	"note" text NOT NULL,
	"evidence" text,
	"verification_status" text NOT NULL,
	"verification_detail" text,
	"replacement_memory_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_id" text,
	"walrus_blob_id" text NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ref" text NOT NULL,
	"distance" real,
	"disposition" text NOT NULL,
	"filter_reason" text,
	"influence" text,
	"decision_changed" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_authorization" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"wallet_address" text,
	"transaction_bytes" text,
	"signature" text,
	"expected_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_authorization_intent_id_unique" UNIQUE("intent_id")
);
--> statement-breakpoint
CREATE TABLE "payment_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text,
	"tool_id" text NOT NULL,
	"resource_url" text NOT NULL,
	"tool_input" jsonb NOT NULL,
	"network" text NOT NULL,
	"scheme" text NOT NULL,
	"asset" text NOT NULL,
	"asset_decimals" integer,
	"asset_symbol" text,
	"amount_atomic" numeric(78, 0) NOT NULL,
	"pay_to" text NOT NULL,
	"max_timeout_seconds" integer NOT NULL,
	"payment_requirements" jsonb NOT NULL,
	"reason" text NOT NULL,
	"alternatives" jsonb,
	"status" "payment_intent_status" DEFAULT 'awaiting_approval' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settlement" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"digest" text NOT NULL,
	"network" text NOT NULL,
	"checkpoint" text,
	"execution_success" boolean,
	"sender" text,
	"asset_verified" boolean NOT NULL,
	"recipient_verified" boolean NOT NULL,
	"amount_verified" boolean NOT NULL,
	"observed_amount_atomic" numeric(78, 0),
	"verified_via" text NOT NULL,
	"final_state" text NOT NULL,
	"detail" jsonb,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settlement_intent_id_unique" UNIQUE("intent_id")
);
--> statement-breakpoint
CREATE TABLE "payment_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"digest" text NOT NULL,
	"facilitator" text NOT NULL,
	"settle_response" jsonb,
	"status" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "run_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"claim_ref" text,
	"note" text NOT NULL,
	"evidence" text,
	"verification_status" text NOT NULL,
	"verification_detail" text,
	"failure_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tool_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"provider" text NOT NULL,
	"operator" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"supported_networks" jsonb NOT NULL,
	"pricing_type" text NOT NULL,
	"price_atomic" numeric(78, 0),
	"price_asset" text,
	"authorization_requirements" text NOT NULL,
	"timeout_ms" integer NOT NULL,
	"availability_status" text NOT NULL,
	"disclosure" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"tool_call_id" text,
	"input" jsonb,
	"output" jsonb,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"latency_ms" integer,
	"payment_intent_id" text,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_performance_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"run_id" text NOT NULL,
	"tool_execution_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_category" text,
	"execution_status" text NOT NULL,
	"verification_status" text NOT NULL,
	"latency_ms" integer,
	"quoted_price_atomic" numeric(78, 0),
	"settled_amount_atomic" numeric(78, 0),
	"asset_type" text,
	"payment_digest" text,
	"outcome" text NOT NULL,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_reliability_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"task_category" text,
	"sample_size" integer NOT NULL,
	"success_count" integer NOT NULL,
	"useful_count" integer NOT NULL,
	"contradicted_count" integer NOT NULL,
	"failure_count" integer NOT NULL,
	"success_rate_lower_bound" real,
	"useful_rate_lower_bound" real,
	"p50_latency_ms" integer,
	"p95_latency_ms" integer,
	"method" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"analysis_depth" "analysis_depth" DEFAULT 'standard' NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"paid_tools_enabled" boolean DEFAULT true NOT NULL,
	"per_payment_limit_atomic" numeric(78, 0),
	"per_run_limit_atomic" numeric(78, 0),
	"daily_limit_atomic" numeric(78, 0),
	"limit_asset" text DEFAULT '0x2::sui::SUI' NOT NULL,
	"notify_on_payment_request" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_result" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"claim_ref" text NOT NULL,
	"claim" text NOT NULL,
	"claim_kind" text NOT NULL,
	"assertion" jsonb,
	"cited_evidence_refs" jsonb NOT NULL,
	"source_provider" text,
	"evidence_reference" text,
	"verification_method" text NOT NULL,
	"status" "verification_status" NOT NULL,
	"observed" jsonb,
	"detail" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x402_sale" (
	"id" text PRIMARY KEY NOT NULL,
	"digest" text NOT NULL,
	"payer" text NOT NULL,
	"pay_to" text NOT NULL,
	"asset" text NOT NULL,
	"amount_atomic" numeric(78, 0) NOT NULL,
	"network" text NOT NULL,
	"resource" text NOT NULL,
	"request_hash" text NOT NULL,
	"facilitator" text NOT NULL,
	"status" text NOT NULL,
	"settle_response" jsonb,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_step" ADD CONSTRAINT "agent_execution_step_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_failure" ADD CONSTRAINT "agent_failure_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_investigation_id_investigation_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_wallet" ADD CONSTRAINT "connected_wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_id_evaluation_run_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."evaluation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_record" ADD CONSTRAINT "evidence_record_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation" ADD CONSTRAINT "investigation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_memory" ADD CONSTRAINT "learning_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_correction" ADD CONSTRAINT "memory_correction_memory_id_learning_memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."learning_memory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_usage" ADD CONSTRAINT "memory_usage_memory_id_learning_memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."learning_memory"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_usage" ADD CONSTRAINT "memory_usage_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_authorization" ADD CONSTRAINT "payment_authorization_intent_id_payment_intent_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement" ADD CONSTRAINT "payment_settlement_intent_id_payment_intent_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_intent_id_payment_intent_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_feedback" ADD CONSTRAINT "run_feedback_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_execution" ADD CONSTRAINT "tool_execution_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_performance_observation" ADD CONSTRAINT "tool_performance_observation_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_result" ADD CONSTRAINT "verification_result_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_step_run_idx" ON "agent_execution_step" USING btree ("run_id","id");--> statement-breakpoint
CREATE INDEX "agent_failure_user_idx" ON "agent_failure" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_failure_run_idx" ON "agent_failure" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_message_run_idx" ON "agent_message" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_user_idx" ON "agent_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_investigation_idx" ON "agent_run" USING btree ("investigation_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_status_idx" ON "agent_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_run_eval_idx" ON "agent_run" USING btree ("evaluation_run_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_event" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_wallet_user_address_uq" ON "connected_wallet" USING btree ("user_id","address","network");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_result_uq" ON "evaluation_result" USING btree ("evaluation_run_id","task_index","mode");--> statement-breakpoint
CREATE INDEX "evaluation_run_user_idx" ON "evaluation_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_run_ref_uq" ON "evidence_record" USING btree ("run_id","ref");--> statement-breakpoint
CREATE INDEX "evidence_reference_idx" ON "evidence_record" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "health_integration_idx" ON "integration_health_event" USING btree ("integration","checked_at");--> statement-breakpoint
CREATE INDEX "investigation_user_idx" ON "investigation" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_idem_uq" ON "job" USING btree ("idempotency_key") WHERE "job"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "job_ready_idx" ON "job" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_memory_idem_uq" ON "learning_memory" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_memory_active_content_uq" ON "learning_memory" USING btree ("namespace","content_hash") WHERE "learning_memory"."status" = 'active';--> statement-breakpoint
CREATE INDEX "learning_memory_user_idx" ON "learning_memory" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_memory_blob_idx" ON "learning_memory" USING btree ("walrus_blob_id");--> statement-breakpoint
CREATE INDEX "learning_memory_storage_idx" ON "learning_memory" USING btree ("storage_status");--> statement-breakpoint
CREATE INDEX "memory_correction_memory_idx" ON "memory_correction" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_usage_run_idx" ON "memory_usage" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "memory_usage_memory_idx" ON "memory_usage" USING btree ("memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intent_idem_uq" ON "payment_intent" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_intent_user_idx" ON "payment_intent" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intent_status_idx" ON "payment_intent" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_tx_digest_uq" ON "payment_transaction" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "payment_tx_intent_idx" ON "payment_transaction" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "run_feedback_run_idx" ON "run_feedback" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_execution_run_idx" ON "tool_execution" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tool_execution_tool_idx" ON "tool_execution" USING btree ("tool_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_obs_execution_uq" ON "tool_performance_observation" USING btree ("tool_execution_id");--> statement-breakpoint
CREATE INDEX "tool_obs_tool_idx" ON "tool_performance_observation" USING btree ("tool_id","recorded_at");--> statement-breakpoint
CREATE INDEX "tool_snapshot_tool_idx" ON "tool_reliability_snapshot" USING btree ("tool_id","computed_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_run_idx" ON "verification_result" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_sale_digest_uq" ON "x402_sale" USING btree ("digest");