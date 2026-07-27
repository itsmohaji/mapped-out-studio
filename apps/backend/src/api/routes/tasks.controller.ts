import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { TasksService } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.service';
import { CreateTaskDto } from '@gitroom/nestjs-libraries/dtos/tasks/create.task.dto';
import { UpdateTaskDto } from '@gitroom/nestjs-libraries/dtos/tasks/update.task.dto';

const d = (v?: string) => (v ? new Date(v) : null);

@ApiTags('Tasks')
@Controller('/tasks')
export class TasksController {
  constructor(private _tasks: TasksService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @Query() q: any) {
    return this._tasks.list(org.id, {
      status: q.status, type: q.type, assigneeId: q.assigneeId, customerId: q.customerId,
    });
  }

  @Get('/summary')
  summary(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User) {
    return this._tasks.summary(org.id, user.id);
  }

  @Post('/')
  create(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: CreateTaskDto) {
    return this._tasks.create(org.id, user.id, {
      ...body, dueAt: d(body.dueAt), remindAt: d(body.remindAt),
    });
  }

  @Put('/:id')
  async update(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Body() body: UpdateTaskDto) {
    const existing = await this._tasks.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._tasks.update(org.id, id, {
      ...body, dueAt: d(body.dueAt), remindAt: d(body.remindAt),
    });
  }

  @Delete('/:id')
  async remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    const existing = await this._tasks.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._tasks.remove(org.id, id);
  }
}
