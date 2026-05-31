import { IsUUID } from 'class-validator';

export class AssignCourierDTO {
  @IsUUID()
  courierId: string;
}

