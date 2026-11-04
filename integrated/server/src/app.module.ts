import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "./config/config.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { ChainModule } from "./chain/chain.module.js";
import { AuthGuard } from "./common/auth.js";
import { DatabaseService } from "./db/database.service.js";
import { FlowsController } from "./flows/flows.controller.js";
import { PipelineService } from "./flows/pipeline.service.js";
import { SessionDetailService } from "./flows/session-detail.service.js";
import { JournalsController } from "./journals/journals.controller.js";
import { JournalsRepository } from "./journals/journals.repository.js";
import { AnonymizationService } from "./manuscripts/anonymization.service.js";
import { ChecksService } from "./manuscripts/checks.service.js";
import { IntakeService } from "./manuscripts/intake.service.js";
import { ManuscriptsController } from "./manuscripts/manuscripts.controller.js";
import { ManuscriptsRepository } from "./manuscripts/manuscripts.repository.js";
import { RevisionService } from "./manuscripts/revision.service.js";
import { RevisionsRepository } from "./manuscripts/revisions.repository.js";
import { RoundService } from "./flows/rounds.service.js";
import { CorpusService, plagiarismProviderFactory } from "./plagiarism/plagiarism.provider.js";
import { PublicController } from "./public/public.controller.js";
import { SeedService } from "./seed/seed.service.js";
import { StorageModule } from "./storage/storage.module.js";
import { IdentityService } from "./users/identity.service.js";
import { MeController } from "./users/me.controller.js";
import { UsersRepository } from "./users/users.repository.js";
import { VerificationController } from "./verification/verification.controller.js";
import { VerificationService } from "./verification/verification.service.js";
import { Reflector } from "@nestjs/core";
import { HttpZkProver } from "@decpub/shared";
import { AssignmentsController } from "./flows/assignments.controller.js";
import { EditorialService } from "./flows/editorial.service.js";
import { ProgressService } from "./flows/progress.service.js";
import { ReviewsService } from "./flows/reviews.service.js";
import { AuditTrailService } from "./public/audit-trail.service.js";
import { ProjectionService } from "./public/projection.service.js";
import { DbInviteChannel, INVITE_CHANNEL } from "./selection/invite-channel.js";
import { InvitationsRepository } from "./selection/invitations.repository.js";
import { EscrowGate } from "./escrow/escrow-gate.js";
import { EscrowService } from "./escrow/escrow.service.js";
import { IncentiveController } from "./incentive/incentive.controller.js";
import { IncentiveRepository } from "./incentive/incentive.repository.js";
import { IncentiveService } from "./incentive/incentive.service.js";
import { QOS_PROVIDER, createQosProvider } from "./incentive/qos.provider.js";
import { ReputationService } from "./incentive/reputation.service.js";
import { SHUFFLE, SelectionService, ZK_PROVER, cryptoShuffle } from "./selection/selection.service.js";

/**
 * Modul akar. `AppModule.forRoot(config)` membuat konfigurasi eksplisit (tes dan skrip demo
 * memberi konfigurasi sendiri; `main.ts` membacanya dari env).
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig) {
    return {
      module: AppModule,
      global: true,
      imports: [StorageModule, ChainModule],
      controllers: [
        AuthController,
        MeController,
        JournalsController,
        VerificationController,
        ManuscriptsController,
        FlowsController,
        AssignmentsController,
        IncentiveController,
        PublicController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        Reflector,
        AuthGuard,
        DatabaseService,
        UsersRepository,
        JournalsRepository,
        ManuscriptsRepository,
        RevisionsRepository,
        AuthService,
        IdentityService,
        VerificationService,
        SeedService,
        CorpusService,
        plagiarismProviderFactory,
        ChecksService,
        IntakeService,
        AnonymizationService,
        PipelineService,
        SessionDetailService,
        InvitationsRepository,
        DbInviteChannel,
        { provide: INVITE_CHANNEL, useExisting: DbInviteChannel },
        { provide: ZK_PROVER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new HttpZkProver(c.zkUrl) },
        { provide: SHUFFLE, useValue: cryptoShuffle },
        SelectionService,
        RoundService,
        ProgressService,
        RevisionService,
        EditorialService,
        ReviewsService,
        ProjectionService,
        AuditTrailService,
        IncentiveRepository,
        { provide: QOS_PROVIDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createQosProvider(c) },
        IncentiveService,
        ReputationService,
        EscrowGate,
        EscrowService,
      ],
      exports: [APP_CONFIG],
    };
  }
}
