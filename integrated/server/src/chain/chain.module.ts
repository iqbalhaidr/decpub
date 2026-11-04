import { Module } from "@nestjs/common";
import { ChainService } from "./chain.service.js";
import { GatewayService } from "./gateway.service.js";
import { SessionReader } from "./session-reader.service.js";

@Module({
  providers: [ChainService, GatewayService, SessionReader],
  exports: [ChainService, GatewayService, SessionReader],
})
export class ChainModule {}
