//> using scala "3.3.0"
//> using repository sonatype:snapshots
//> using dep org.typelevel::cats-core:2.9.0
//> using dep org.typelevel::cats-effect:3.5.0
//> using dep org.scalikejdbc::scalikejdbc:4.0.0
//> using dep org.mariadb.jdbc:mariadb-java-client:3.1.4

import cats.effect.{ExitCode, IO, IOApp, Resource}
import scalikejdbc.{ConnectionPool, DB, scalikejdbcSQLInterpolationImplicitDef}

object OpenCloseDBConnection extends IOApp {
  override def run(args: List[String]): IO[ExitCode] = {
    val host = "127.0.0.1"
    val port = "13306"
    val dbName = "cats_playground"
    val url = s"jdbc:mariadb://$host:$port/$dbName"
    val user = "root"
    val password = ""

    val withDB = Resource.make {
      for {
        _ <- IO.println("opening...")
        _ <- IO(ConnectionPool.singleton(url, user, password))
        _ <- IO.println("opened!!")
      } yield ()
    } { _ =>
      for {
        _ <- IO.println("closing...")
        _ <- IO(ConnectionPool.closeAll())
        _ <- IO.println("closed!!")
      } yield ()
    }

    withDB
      .use { _ =>
        IO.never
      }
      .as(ExitCode.Success)
  }
}
