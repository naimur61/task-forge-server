import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserSummaryResponse } from '../common/dto/user-summary.dto.js';
import { ApiListEnvelope } from '../common/swagger/api-envelope.decorators.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { UsersService } from './users.service.js';

/** User lookup. */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Finds registered users by name or email (max 10). */
  @Get('search')
  @ApiListEnvelope(UserSummaryResponse)
  search(@Query() query: QueryUsersDto): Promise<UserSummaryResponse[]> {
    return this.users.search(query.q);
  }
}
