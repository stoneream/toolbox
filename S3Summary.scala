//> using scala "2.13"
//> using lib "com.amazonaws:aws-java-sdk-s3:1.12.360"

import com.amazonaws.auth.{AWSCredentials, AWSCredentialsProvider}
import com.amazonaws.regions.Regions
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import scala.jdk.CollectionConverters.ListHasAsScala

object S3Summary {
  def main(args: Array[String]): Unit = {

    val credentialsProvider = new AWSCredentialsProvider {
      override def getCredentials: AWSCredentials = new AWSCredentials {
        override def getAWSAccessKeyId: String = "getawsaccesskeyidhere"

        override def getAWSSecretKey: String = "getawssecretkeyhere"
      }

      override def refresh(): Unit = {
        // do nothing
      }
    }

    val bucketName = "bucketnamehere"
    val prefix = "prefix/here"

    val s3Client = AmazonS3ClientBuilder.standard().withRegion(Regions.AP_NORTHEAST_1).withCredentials(credentialsProvider).build()

    s3Client.listObjects(bucketName, prefix).getObjectSummaries.asScala.foreach { summary =>
      println(s"${summary.getKey}")
    }

  }
}
