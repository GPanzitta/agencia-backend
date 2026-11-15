import { Column, Entity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @OneToMany(() => User, (user) => user.role)
  users: User[];
}
