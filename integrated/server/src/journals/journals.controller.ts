import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsIn, IsNumber, Max, Min } from "class-validator";
import { Auth } from "../common/auth.js";
import { JournalsRepository, WEIGHT_PRESETS } from "./journals.repository.js";

export class WeightPolicyDto {
  @ApiProperty({ enum: WEIGHT_PRESETS })
  @IsIn([...WEIGHT_PRESETS])
  preset!: string;

  @ApiProperty({ minimum: 0, maximum: 1, description: "λ pada W = λ·Wsub + (1-λ)·Wobj" })
  @IsNumber()
  @Min(0)
  @Max(1)
  lambda!: number;
}

@ApiTags("P01 - Pra-pengajuan: katalog jurnal")
@Controller("journals")
export class JournalsController {
  constructor(private readonly journals: JournalsRepository) {}

  @ApiOperation({ summary: "Katalog jurnal: kategori, APC, kebijakan bobot insentif." })
  @Get()
  list() {
    return { categories: this.journals.categories(), journals: this.journals.list() };
  }

  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    const j = this.journals.get(id);
    if (!j) throw new NotFoundException("Jurnal tidak ditemukan");
    return j;
  }

  @ApiOperation({
    summary: "Ubah kebijakan bobot jurnal (admin).",
    description: "Berlaku untuk sesi baru; sesi yang sudah dibuat tetap memakai kebijakan saat dibuat (D1).",
  })
  @Auth("admin")
  @Patch(":id/weight-policy")
  setWeightPolicy(@Param("id", ParseIntPipe) id: number, @Body() dto: WeightPolicyDto) {
    if (!this.journals.get(id)) throw new NotFoundException("Jurnal tidak ditemukan");
    if (!Number.isFinite(dto.lambda)) throw new BadRequestException("lambda tidak sah");
    this.journals.setWeightPolicy(id, { preset: dto.preset, lambda: dto.lambda });
    return this.journals.get(id);
  }
}
