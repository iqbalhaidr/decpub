import { Module } from "@nestjs/common";
import { ChainService } from "./chain.service.js";
import { GatewayService } from "./gateway.service.js";
import { IncentiveReader } from "./incentive-reader.service.js";
import { SessionReader } from "./session-reader.service.js";

@Module({
  providers: [ChainService, GatewayService, SessionReader, IncentiveReader],
  exports: [ChainService, GatewayService, SessionReader, IncentiveReader],
})
export class ChainModule {}
