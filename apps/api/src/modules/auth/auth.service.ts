import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { users } from '../../database/schema';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async seedDefaultAdmin() {
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@brabogm.com'))
      .limit(1);

    if (!existing) {
      const hash = await bcrypt.hash('admin123', 10);
      await this.db.insert(users).values({
        name: 'Admin',
        email: 'admin@brabogm.com',
        passwordHash: hash,
        role: 'admin',
      });
    }
  }
}
