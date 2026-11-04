
classDiagram
  direction TB

  class Author {
    +walletAddress: address
    +submitPaper(title, escrow)
    +depositEscrow(amount)
  }

  class Editor {
    +walletAddress: address
    +setBWMPreferences(best, worst, bestToOthers, othersToWorst)
    +setLambda(value)
    +setSigmoidK(value)
    +assignReviewers(batch, reviewers)
    +evaluateAccuracy(reviewer, ratio)
  }

  class Reviewer {
    +walletAddress: address
    +name: string
    +sbtBalance: uint256
    +submitReview(batchId, text)
    +getEffectiveReputation()
  }

  class QoSEngine {
    +computeQ1(assignedDate, submitDate)
    +computeQ2(reviewText)
    +computeQ3(editorAcceptRatio)
    +computeQ4(sbtBalance)
    +buildMatrix(reviewers)
  }

  class NormalizationModule {
    +normalize(matrix, types)
    -minMaxScale(column, type)
  }

  class WeightingModule {
    +computeBWM(input)
    +computeECWM(matrix, gamma)
    +fuseWeights(Wsub, Wobj, lambda)
    -computeEntropyWeights(matrix)
    -computeCRITICWeights(matrix)
  }

  class TOPSISModule {
    +topsis(normalizedMatrix, weights, types)
    -computePIS(weightedMatrix)
    -computeNIS(weightedMatrix)
    -euclideanDistance(row, ref)
    -closenessCoefficient(dPlus, dMinus)
  }

  class SigmoidDistributor {
    +sigmoid(score, k, x0)
    +distribute(scores, pool, params)
  }

  class IncentiveEngine {
    +reviewToken: ReviewToken
    +reputationSBT: ReputationSBT
    +sigmoidK: uint256
    +sigmoidX0: uint256
    +batches: mapping
    +createBatch(reviewers) payable
    +executeDistribution(batchId, matrix, weights)
    -_topsis(matrix, weights, n)
    -_sigmoid(score)
    -_sqrt(x)
  }

  class ReviewToken {
    +name: string
    +symbol: string
    +mint(to, amount)
    +balanceOf(account)
  }

  class ReputationSBT {
    +decayRatePerDay: uint256
    +balances: mapping
    +lastActiveTimestamp: mapping
    +mint(to, amount)
    +balanceOf(account)
    +effectiveBalance(account)
    +triggerDecay(account)
    -_applyDecay(account)
  }

  class Batch {
    +author: address
    +escrowAmount: uint256
    +reviewers: addressList
    +distributed: bool
  }

  Author --> IncentiveEngine : createBatch()
  Editor --> WeightingModule : BWM preferences
  Editor --> QoSEngine : accuracy evaluation
  Reviewer --> QoSEngine : submitReview()

  QoSEngine --> NormalizationModule : raw matrix
  NormalizationModule --> WeightingModule : normalized matrix
  WeightingModule --> TOPSISModule : fused weights
  TOPSISModule --> SigmoidDistributor : TOPSIS scores
  SigmoidDistributor --> IncentiveEngine : distribution amounts

  IncentiveEngine --> ReviewToken : mint rewards
  IncentiveEngine --> ReputationSBT : mint reputation
  IncentiveEngine *-- Batch : contains

  ReputationSBT --> QoSEngine : q4 data

